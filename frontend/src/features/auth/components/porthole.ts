import showcasePhoto from '../../../assets/showcase-photo.svg'
import type { GlobeIntro, GlobeShowcase } from '../../globe/GlobeView'

export type AuthView = 'signin' | 'signup'
type Rect = { x: number; y: number; w: number; h: number }

/** The photo pin in the porthole view: the Benguet highlands, Luzon. Placeholder photo. */
export const SHOWCASE_PIN: GlobeShowcase = { lat: 16.6, lon: 120.9, image: showcasePhoto, label: 'Benguet · PH' }

/**
 * Each form has its own window onto the Earth; switching between them turns the globe.
 * `look` is the point under the middle of the globe: sign-in sees the pin just above it,
 * sign-up looks up from over Australia with the pin high on the curve.
 */
export const PORT_WINDOWS: Record<AuthView, { label: string; look: { lat: number; lon: number } }> = {
  signin: { label: '01', look: { lat: 8.8, lon: 122.1 } },
  signup: { label: '02', look: { lat: -25.5, lon: 134.2 } },
}

/**
 * Big and low in the window, as in the design: the centre near the bottom right, the curve of the Earth across
 * the view. A little further out than the design, so the satellite imagery isn't magnified past its resolution.
 */
export function portholeFraming(win: Rect, view: AuthView): GlobeIntro {
  const { look } = PORT_WINDOWS[view]
  return {
    cx: Math.round(win.x + win.w * 0.74),
    cy: Math.round(win.y + win.h * 0.87),
    r: Math.round(Math.min(win.h * 0.6, win.w * 0.54)),
    lat: look.lat,
    lon: look.lon,
  }
}
