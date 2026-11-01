import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useProfile } from '../features/account/useProfile'
import type { SignInInput, SignUpInput } from '../features/auth/service'
import { useAuth } from '../features/auth/useAuth'
import { useChat } from '../features/chat/useChat'
import CallOverlay from '../features/calls/components/CallOverlay'
import { useCall } from '../features/calls/useCall'
import AddFriendDialog from '../features/friends/components/AddFriendDialog'
import { friendsApi } from '../features/friends/service'
import { useFriends } from '../features/friends/useFriends'
import AuthScreen from '../features/auth/components/AuthScreen'
import { SHOWCASE_PIN } from '../features/auth/components/porthole'
import CapturesPanel, { type CapturesView } from '../features/memories/components/CapturesPanel'
import PostViewer from '../features/memories/components/PostViewer'
import ChatPanel from '../features/chat/components/ChatPanel'
import DetailsToggle from '../features/home/DetailsToggle'
import Dock from '../features/home/Dock'
import FunFact from '../features/home/FunFact'
import GlobeView, { type GlobeFocus, type GlobeIntro } from '../features/globe/GlobeView'
import NotificationTab from '../features/home/NotificationTab'
import ProfileMenu from '../features/account/components/ProfileMenu'
import LyricsPanel from '../features/spotify/components/LyricsPanel'
import NowPlaying from '../features/spotify/components/NowPlaying'
import '../features/spotify/components/spotify.css'
import { GLOBE_ROTATION, NOTIFICATION_MS } from './config'
import { closeSocket, onChannel, openSocket } from '../shared/lib/socket'
import { accountService, authService, chatServiceFor, memoryServiceFor, mockMode } from './services'
import { users } from '../mocks/people'
import { useMediaQuery } from '../shared/hooks/useMediaQuery'
import type { LatLon } from '../shared/lib/places'
import { useSpotify } from '../features/spotify/useSpotify'
import { useNotifications } from '../features/home/useNotifications'
import { useMemories } from '../features/memories/useMemories'
import type { Memory, User } from '../shared/types'
import './App.css'

const DETAILS_KEY = 'memoir.globe.details'

/** One side panel at a time: Logged Captures slides in from the left, Messages from the right. */
type Panel = 'captures' | 'chat' | null

/**
 * Checking: asking the server whether an earlier session is still valid (a moment, before anything shows).
 * Signed out: the sign-in screen. Signing in opens the porthole window up to the whole screen while the
 * camera pulls back into space (entering), then the home controls ease in (arriving).
 */
type Phase = 'checking' | 'auth' | 'entering' | 'arriving' | 'home'
const ENTER_MS = 1500 // the window opening in auth.css (0.15s delay + 1.2s), plus a beat
const ARRIVE_MS = 1700 // the slowest ease-in (the fun fact)
const NO_MEMORIES: Memory[] = []

export default function App() {
  const auth = useAuth(authService)
  const signedIn = !!auth.session
  const meId = auth.session?.user.id ?? ''
  const profileApi = useProfile(accountService, signedIn)
  const requests = useFriends(signedIn && !mockMode)
  const [entry, setEntry] = useState<'entering' | 'arriving' | null>(null)
  const phase: Phase = auth.session === undefined ? 'checking' : !auth.session ? 'auth' : (entry ?? 'home')
  const atHome = phase === 'arriving' || phase === 'home'
  const [authFrame, setAuthFrame] = useState<GlobeIntro | null>(null)
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [details, setDetails] = useState(() => localStorage.getItem(DETAILS_KEY) !== 'off')
  const [panel, setPanel] = useState<Panel>(null)
  const [capturesView, setCapturesView] = useState<CapturesView>('list')
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [onMap, setOnMap] = useState(false)
  const [focus, setFocus] = useState<GlobeFocus | null>(null)
  const { current: notification, push: notify, next: nextNotification } = useNotifications()
  const spotify = useSpotify(signedIn)
  // rebuilt when the signed-in person changes, so nothing of theirs is left over
  const chat = useChat(useMemo(() => chatServiceFor(meId), [meId]))
  const memories = useMemories(useMemo(() => memoryServiceFor(meId), [meId]))
  const call = useCall(signedIn && !mockMode)
  const [addingFriend, setAddingFriend] = useState(false)
  const bottomRef = useRef<HTMLElement>(null)
  const capturesRef = useRef<HTMLElement>(null)
  const [stageBottom, setStageBottom] = useState<number>()
  const [stageLeft, setStageLeft] = useState(0)
  const chatOpen = panel === 'chat'
  const capturesOpen = panel === 'captures'
  const viewing = viewingId ? memories.byId(viewingId) : undefined
  const phone = useMediaQuery('(max-width: 760px)')
  // New post location: the Post step turns placing on; clicking the globe drops draftPin, which can be dragged
  const [draftPin, setDraftPin] = useState<LatLon | null>(null)
  const [placingWanted, setPlacingWanted] = useState(false)
  const placing = placingWanted && capturesOpen && (capturesView === 'upload' || capturesView === 'edit')
  const friends = useMemo(() => chat.people.map((p) => p.user), [chat.people])

  useEffect(() => {
    localStorage.setItem(DETAILS_KEY, details ? 'on' : 'off')
  }, [details])

  // the live connection: new messages, presence, friend requests and calls
  useEffect(() => {
    if (!signedIn || mockMode) return
    openSocket()
    return closeSocket
  }, [signedIn])

  // pop-up notifications pushed by the server (Do not disturb and the switches are applied there)
  useEffect(() => {
    if (!signedIn || mockMode) return
    const handle = (push: { event?: unknown }) => {
      const event = push.event as { type?: string; from?: User; message?: string } | undefined
      if (event?.type === 'notification' && event.from && event.message) notify({ from: event.from, message: event.message })
    }
    const offs = ['chat', 'memories', 'friends'].map((channel) => onChannel(channel, handle as (push: { channel: string }) => void))
    return () => offs.forEach((off) => off())
  }, [signedIn, notify])

  useEffect(() => {
    if (phase !== 'entering' && phase !== 'arriving') return
    const t = setTimeout(() => setEntry(phase === 'entering' ? 'arriving' : null), reduceMotion ? 0 : phase === 'entering' ? ENTER_MS : ARRIVE_MS)
    return () => clearTimeout(t)
  }, [phase, reduceMotion])

  // The entrance is armed before the request and starts when the session arrives.
  const signIn = async (input: SignInInput) => {
    setEntry('entering')
    try {
      await auth.signIn(input)
    } catch (err) {
      setEntry(null)
      throw err
    }
  }
  const signUp = async (input: SignUpInput) => {
    setEntry('entering')
    try {
      const result = await auth.signUp(input)
      if (result.status !== 'signed-in') setEntry(null)
      return result
    } catch (err) {
      setEntry(null)
      throw err
    }
  }
  const { signOut: endSession } = auth
  const signOut = useCallback(() => {
    setPanel(null)
    setViewingId(null)
    setEntry(null)
    void endSession()
  }, [endSession])

  // The globe rests above the fun fact with a clear gap, whatever the screen size.
  useLayoutEffect(() => {
    const el = bottomRef.current
    if (!el) return
    const measure = () => setStageBottom(Math.round(el.getBoundingClientRect().top - Math.max(48, window.innerHeight * 0.08)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // With Logged Captures open, the globe moves into the space to the right of it
  // (on phones the panel covers the screen, so it stays put).
  useLayoutEffect(() => {
    const el = capturesRef.current
    if (!el) return
    const measure = () => setStageLeft(capturesOpen && !phone ? el.offsetLeft + el.offsetWidth : 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [capturesOpen, phone])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewingId) setViewingId(null)
        else if (panel) setPanel(null)
      }
      // Dev only (outside text fields, page focused rather than the globe): N previews a tag notification,
      // which Do not disturb and the "Tags in posts" switch mute; L signs out.
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (import.meta.env.DEV && phase === 'home' && !typing) {
        const me = profileApi.profile
        if ((e.key === 'n' || e.key === 'N') && me && me.user.status !== 'dnd' && me.notifications.tags) notify({ from: users[0], message: 'Tagged you in an Album' })
        if (e.key === 'l' || e.key === 'L') signOut()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel, viewingId, notify, phase, signOut, profileApi.profile])

  const openCaptures = (view: CapturesView) => {
    const same = capturesOpen && (view === 'upload') === (capturesView === 'upload')
    if (same) setPanel(null) // the same dock button closes it again
    else {
      setCapturesView(view)
      setPanel('captures')
    }
  }

  const flyTo = useCallback((to: LatLon, range: number) => setFocus({ lat: to.lat, lon: to.lon, range, nonce: Date.now() }), [])
  const placement = useMemo(() => ({ pin: draftPin, setPin: setDraftPin, setPlacing: setPlacingWanted, flyTo }), [draftPin, flyTo])

  // a closer look that still shows the curve of the globe (resting distance is about 5)
  const locate = useCallback(
    (m: Memory) => {
      setViewingId(null)
      flyTo(m.place, 3)
    },
    [flyTo],
  )

  // keep the globe still while you browse your captures, so "show on globe" stays put,
  // and on the sign-in screen, so the photo pin stays in the window
  const rotation = useMemo(() => ({ ...GLOBE_ROTATION, enabled: GLOBE_ROTATION.enabled && !capturesOpen && atHome }), [capturesOpen, atHome])

  return (
    <main className={`app is-${phase}${chatOpen ? ' chat-open' : ''}${capturesOpen ? ' captures-open' : ''}`}>
      {/* waits for the session check, so the globe starts in the right place (porthole or home) */}
      {phase !== 'checking' && (
        <GlobeView
          memories={atHome ? memories.visible : NO_MEMORIES}
          details={details && atHome}
          rotation={rotation}
          stageBottom={stageBottom}
          stageLeft={stageLeft}
          // the globe's sunlight button sits under the chat panel, and under Logged Captures on phones
          controls={atHome && !chatOpen && !(capturesOpen && phone)}
          focus={focus}
          paused={!!viewing}
          placing={placing}
          draftPin={draftPin}
          onPlace={setDraftPin}
          onPinClick={setViewingId}
          onSurfaceChange={setOnMap}
          intro={phase === 'auth' ? authFrame : null}
          showcase={phase === 'auth' ? SHOWCASE_PIN : null}
        />
      )}

      {(phase === 'auth' || phase === 'entering') && <AuthScreen leaving={phase === 'entering'} onSignIn={signIn} onSignUp={signUp} onFrame={setAuthFrame} />}

      {/* Mounted while signed out too (hidden), so the globe's home layout is measured before the entrance. */}
      <div className="home-ui" inert={!atHome}>
        {placing && !phone && (
          <div className={`place-note${onMap ? ' on-map' : ''}`} style={{ left: stageLeft }}>
            <p>Note: Click the map to pin point the location where you took the image, then drag the pin to adjust.</p>
          </div>
        )}

        {/* the player and notifications share the top-centre spot: a notification takes it for its 7 seconds */}
        <NowPlaying spotify={spotify} hidden={!!notification || !atHome} />
        <NotificationTab item={notification} durationMs={NOTIFICATION_MS} onDone={nextNotification} />
        {spotify.notice && (
          <p className="sp-toast" role="status">
            {spotify.notice}
          </p>
        )}
        <LyricsPanel spotify={spotify} shown={spotify.lyricsOn && !!spotify.playback && !capturesOpen && !phone && atHome} />
        <ProfileMenu profileApi={profileApi} email={auth.session?.email ?? ''} spotify={spotify} onSignOut={signOut} />
        <DetailsToggle on={details} onChange={setDetails} />

        <footer className="bottom" ref={bottomRef}>
          {/* remounted as the controls arrive, so its fade-in plays then */}
          <FunFact key={atHome ? 'home' : 'away'} onMap={onMap} />
          <Dock
            active={chatOpen ? 'messages' : capturesOpen ? (capturesView === 'upload' ? 'add' : 'memories') : null}
            onAddMemory={() => openCaptures('upload')}
            onOpenMemories={() => openCaptures('list')}
            onOpenMessages={() => setPanel((p) => (p === 'chat' ? null : 'chat'))}
          />
        </footer>

        <CapturesPanel
          ref={capturesRef}
          open={capturesOpen}
          view={capturesView}
          onViewChange={setCapturesView}
          memories={memories}
          users={chat.users}
          friends={friends}
          placement={placement}
          onView={(m) => setViewingId(m.id)}
          onLocate={locate}
          // TODO: profiles
          onOpenProfile={() => {}}
        />

        <ChatPanel
          open={chatOpen}
          onClose={() => setPanel(null)}
          chat={chat}
          memories={memories.visible}
          onShowMemory={(m) => setViewingId(m.id)}
          onCall={(kind) => chat.other && call.start(chat.other, kind)}
          onAddFriend={() => setAddingFriend(true)}
          requestCount={requests.incoming.length}
          onRemoveFriend={(userId) => void friendsApi.unfriend(userId)}
        />

        {viewing && (
          <PostViewer
            key={viewing.id}
            memory={viewing}
            meId={memories.meId}
            users={chat.users}
            onClose={() => setViewingId(null)}
            onLocate={locate}
            // TODO: profiles
            onOpenProfile={() => {}}
          />
        )}
      </div>

      {addingFriend && <AddFriendDialog myUniqueId={profileApi.profile?.uniqueId} requests={requests} people={friends} onClose={() => setAddingFriend(false)} />}
      <CallOverlay call={call} />
      {call.notice && (
        <p className="sp-toast" role="status">
          {call.notice}
        </p>
      )}
    </main>
  )
}
