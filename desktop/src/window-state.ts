import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Where the window was last time, remembered between launches.
 *
 * Electron has nothing built in for this, and a desktop app that opens 1280×800 in the middle of
 * the screen every time feels like a web page rather than an app. Kept as one small file in the
 * app's own data folder, written at most once a second while a drag is in progress.
 *
 * The saved position is checked against the monitors that exist *now*: unplugging the screen it was
 * on would otherwise reopen it at coordinates nobody can see, with no way to get it back.
 */

type State = { width: number; height: number; x?: number; y?: number; maximized?: boolean }

const DEFAULT: State = { width: 1280, height: 800 }
const file = () => path.join(app.getPath('userData'), 'window-state.json')

const onAScreen = (bounds: Rectangle) =>
  screen.getAllDisplays().some((display) => {
    const a = display.workArea
    // its top-left corner has to be somewhere visible; a window half off the edge is fine and normal
    return bounds.x >= a.x - 8 && bounds.y >= a.y - 8 && bounds.x < a.x + a.width && bounds.y < a.y + a.height
  })

export function loadWindowState(): State {
  let saved: Partial<State>
  try {
    saved = JSON.parse(readFileSync(file(), 'utf8')) as Partial<State>
  } catch {
    return DEFAULT // no file yet, or it was edited into nonsense
  }

  const width = Number.isFinite(saved.width) ? Math.max(900, saved.width!) : DEFAULT.width
  const height = Number.isFinite(saved.height) ? Math.max(600, saved.height!) : DEFAULT.height
  const placed = Number.isFinite(saved.x) && Number.isFinite(saved.y)
  const state: State = { width, height, maximized: !!saved.maximized }
  if (placed && onAScreen({ x: saved.x!, y: saved.y!, width, height })) {
    state.x = saved.x
    state.y = saved.y
  }
  return state
}

export function watchWindowState(win: BrowserWindow) {
  let timer: NodeJS.Timeout | undefined

  const save = () => {
    // the size to remember is the un-maximized one, or restoring would open it maximized for good
    const bounds = win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds()
    try {
      writeFileSync(file(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }))
    } catch {
      // a read-only or full disk is not a reason to interrupt somebody; it just opens where it did
    }
  }

  const later = () => {
    clearTimeout(timer)
    timer = setTimeout(save, 1000) // a drag fires these continuously
  }

  // listed one by one rather than looped: `on` is overloaded per event name, so a union of them
  // matches no single overload
  win.on('resize', later)
  win.on('move', later)
  win.on('maximize', later)
  win.on('unmaximize', later)
  // and once for certain on the way out, so the last position is never the one that got debounced away
  win.on('close', () => {
    clearTimeout(timer)
    save()
  })
}
