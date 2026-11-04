import { app, BrowserWindow, Menu, nativeImage, session, shell, Tray, type MenuItemConstructorOptions } from 'electron'
import path from 'node:path'
import { ALLOWED_PERMISSIONS, APP_ORIGIN, APP_URL, isApp, mayNavigateTo } from './origins'
import { loadWindowState, watchWindowState } from './window-state'

// Memoir on the desktop: one window onto the hosted web app, and a tray icon so closing it doesn't
// sign you out of anything. Deliberately thin — there is no copy of the app in here, so a release
// of the web app is a release of this, and nothing can drift between the two.
//
// Why thin rather than bundling the built frontend: the server has one APP_URL, and everything that
// has to send a person back to the app — a confirmation email, a password reset, the Spotify
// callback — points at it. A bundled app served from a custom scheme would have an origin the server
// has never heard of, so those three journeys would end in the browser rather than in the app. See
// docs/roadmap.md.

/**
 * `ELECTRON_RUN_AS_NODE` turns the Electron binary into a plain Node, so `require('electron')` hands
 * back the path to the binary instead of the API and the first line that touches `app` dies with
 * "Cannot read properties of undefined". VS Code sets this variable in its integrated terminal, so
 * `npm start` from inside the editor hits it while the same command in a normal terminal is fine —
 * which is a confusing half-hour unless something says so.
 */
if (!app) {
  console.error(
    'Electron is running as plain Node, so there is no app to start.\n' +
      'ELECTRON_RUN_AS_NODE is set in this shell — VS Code sets it in its integrated terminal.\n' +
      'Run it in a normal terminal, or: env -u ELECTRON_RUN_AS_NODE npm start',
  )
  process.exit(1)
}

/** Keeps the window alive in the tray when it is closed, until the app is really being quit. */
let quitting = false
let win: BrowserWindow | null = null
let tray: Tray | null = null

const asset = (file: string) => path.join(__dirname, '..', 'assets', file)

/**
 * Hands a link to the real browser, if it is the kind of link a browser should get.
 *
 * Only http and https: a page can ask to open anything, and `shell.openExternal` will happily pass
 * `file:`, `smb:` or a custom scheme straight to the operating system. `new URL` is in the try
 * because a malformed address would otherwise throw inside an event handler and take the main
 * process down with it.
 */
function openExternally(url: string) {
  try {
    if (/^https?:$/.test(new URL(url).protocol)) void shell.openExternal(url)
  } catch {
    // not an address we can make sense of; drop it
  }
}

/**
 * A plain Chrome user agent.
 *
 * Electron's default announces `Electron/39` and `Memoir/0.1.0`, and sign-in pages treat an unknown
 * embedded browser as a phishing risk — Google refuses them outright, and others serve a degraded
 * page. Memoir's own API does not care, but Spotify's consent page is a third-party sign-in reached
 * in this window (see origins.ts), so it is worth looking ordinary.
 */
function chromeUserAgent() {
  return app.userAgentFallback
    .replace(/ Electron\/[\d.]+/, '')
    .replace(new RegExp(` ${app.getName()}\\/[\\d.]+`), '')
}

function createWindow() {
  const state = loadWindowState()

  win = new BrowserWindow({
    ...state,
    minWidth: 900,
    minHeight: 600,
    title: 'Memoir',
    backgroundColor: '#0b0b0d', // shown for the moment before the page paints, instead of white
    icon: process.platform === 'linux' ? asset('icon.png') : undefined,
    show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      // The renderer is a remote page, so it gets none of Electron: no Node, no require, its own
      // context, and the OS sandbox. There is no preload, because there is nothing to expose.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      spellcheck: true,
    },
  })

  if (state.maximized) win.maximize()
  win.once('ready-to-show', () => win?.show())
  watchWindowState(win)

  /**
   * Anything that is not Memoir opens in the real browser. That covers the terms and privacy links,
   * and it is also what makes this safe to leave pointed at a site: a link somebody sends in a chat
   * cannot turn this window into a browser for an arbitrary page.
   */
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (mayNavigateTo(url)) return
    event.preventDefault()
    openExternally(url)
  })

  // the app is not reachable — offline, or the free instance is still waking up (which takes up to
  // a minute). A blank window with no explanation is the worst version of this.
  win.webContents.on('did-fail-load', (_event, code, description, failedUrl, isMainFrame) => {
    // -3 is an aborted load, which is what a redirect we interrupted looks like; not a failure
    if (!isMainFrame || code === -3) return
    const hash = new URLSearchParams({ url: APP_URL, reason: `${description} (${code})` }).toString()
    void win?.webContents.loadFile(asset('offline.html'), { hash })
    console.error(`Could not load ${failedUrl}: ${description} (${code})`)
  })

  win.on('close', (event) => {
    // closing the window leaves it in the tray, so the live connection and the session survive
    if (quitting || process.platform === 'linux') return
    event.preventDefault()
    win?.hide()
  })

  win.on('closed', () => {
    win = null
  })

  // enough to tell, from a terminal, whether a report of "it just sits there" is this app failing
  // to load or the web app failing to sign in
  win.webContents.on('did-finish-load', () => console.log(`Loaded ${win?.webContents.getURL()}`))

  console.log(`Memoir desktop ${app.getVersion()} — opening ${APP_URL}`)
  void win.loadURL(APP_URL)
}

function show() {
  if (!win) return createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createTray() {
  // a template image is black-and-transparent and macOS recolours it for a light or dark menu bar
  const image = nativeImage.createFromPath(asset(process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'))
  if (process.platform === 'darwin') image.setTemplateImage(true)

  tray = new Tray(image)
  tray.setToolTip('Memoir')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Memoir', click: show },
      { type: 'separator' },
      { label: 'Reload', click: () => win?.webContents.reload() },
      { type: 'separator' },
      {
        label: 'Quit Memoir',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ]),
  )
  // on Windows and Linux a left click is expected to open the app; on macOS it opens the menu
  tray.on('click', () => {
    if (process.platform !== 'darwin') show()
  })
}

/**
 * A menu is not optional on macOS: without one, the standard shortcuts — copy, paste, select all,
 * even Cmd+Q — stop working, because they are driven by menu roles rather than by the key press.
 * On Windows and Linux it is hidden (`autoHideMenuBar`) but still carries the accelerators.
 */
function createMenu() {
  const mac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(mac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => win?.webContents.reload() },
        { type: 'separator' },
        mac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      role: 'help',
      submenu: [{ label: 'Open Memoir in your browser', click: () => void shell.openExternal(APP_URL) }],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/**
 * One copy at a time. Without this, launching it again from the dock or the Start menu would open a
 * second window with a second WebSocket — which the server counts as the same person twice, and
 * which would make the app fight itself over presence.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', show)

  void app.whenReady().then(() => {
    app.userAgentFallback = chromeUserAgent()

    /**
     * Calls need the camera and the microphone; nothing else is granted, and only to Memoir itself.
     * Electron grants several of these by default, so this is a narrowing, not an addition.
     */
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
      callback(isApp(contents.getURL()) && ALLOWED_PERMISSIONS.has(permission))
    })
    // the synchronous twin, used for checks the page makes without prompting
    session.defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
      return requestingOrigin === APP_ORIGIN && ALLOWED_PERMISSIONS.has(permission)
    })

    createMenu()
    createTray()
    createWindow()

    // macOS: clicking the dock icon after the window was closed brings it back
    app.on('activate', show)
  })

  app.on('before-quit', () => {
    quitting = true
  })

  // the tray keeps the app running with no window, which is the point; on Linux, where the tray is
  // unreliable across desktops, closing the window quits as people expect
  app.on('window-all-closed', () => {
    if (process.platform === 'linux') app.quit()
  })
}
