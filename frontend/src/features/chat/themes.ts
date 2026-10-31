// Per-conversation customisation options. Stored by key so the backend only saves a short string.

export const CHAT_COLORS: Record<string, { label: string; value: string }> = {
  blue: { label: 'Blue', value: '#3a92d0' },
  violet: { label: 'Violet', value: '#8b5cf6' },
  pink: { label: 'Pink', value: '#e0559a' },
  red: { label: 'Red', value: '#e0464b' },
  orange: { label: 'Orange', value: '#ec8a3a' },
  green: { label: 'Green', value: '#2fa866' },
  teal: { label: 'Teal', value: '#1f9fa6' },
  graphite: { label: 'Graphite', value: '#6b7280' },
}

export const CHAT_BACKGROUNDS: Record<string, { label: string; value: string }> = {
  plain: { label: 'Plain', value: '#1c1c1c' },
  midnight: { label: 'Midnight', value: 'radial-gradient(120% 80% at 80% 0%, #1d2b4a 0%, #121726 55%, #0c0e14 100%)' },
  aurora: { label: 'Aurora', value: 'linear-gradient(160deg, #0f2a2a 0%, #13202b 45%, #1d1530 100%)' },
  dusk: { label: 'Dusk', value: 'linear-gradient(170deg, #2b1b2e 0%, #1f1a26 50%, #141318 100%)' },
  ember: { label: 'Ember', value: 'radial-gradient(110% 70% at 10% 100%, #3a1d12 0%, #1f1715 60%, #151313 100%)' },
  ocean: { label: 'Ocean', value: 'linear-gradient(180deg, #0f2236 0%, #0f1a26 60%, #0c1219 100%)' },
}

export const DEFAULT_SETTINGS = { color: 'blue', background: 'plain' } as const

export const chatColor = (key: string) => (CHAT_COLORS[key] ?? CHAT_COLORS.blue).value
export const chatBackground = (key: string) => (CHAT_BACKGROUNDS[key] ?? CHAT_BACKGROUNDS.plain).value
