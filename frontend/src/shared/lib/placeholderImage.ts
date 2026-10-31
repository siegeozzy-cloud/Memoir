// Stand-in photos for mock data: a small SVG landscape (sky gradient, sun, hills) as a data URI,
// varied by seed so a grid of them doesn't look identical.

const SKIES = [
  ['#f6a96b', '#c4567d'],
  ['#7ec8f0', '#3768b5'],
  ['#ffd27f', '#f06e5a'],
  ['#9fd8c2', '#2f7d8c'],
  ['#c3a6f2', '#5b4bb5'],
  ['#ffb3a1', '#7b4f9d'],
]

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export function placeholderImage(seed: string, w = 640, h = 480) {
  const n = hash(seed)
  const [a, b] = SKIES[n % SKIES.length]
  const sx = 20 + (n % 60)
  const hill = 55 + ((n >> 8) % 15)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 75" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="100" height="75" fill="url(#s)"/><circle cx="${sx}" cy="28" r="8" fill="#fff" opacity=".75"/>
<path d="M0 ${hill} Q25 ${hill - 14} 50 ${hill - 2} T100 ${hill - 6} V75 H0z" fill="#000" opacity=".28"/>
<path d="M0 ${hill + 8} Q30 ${hill - 2} 60 ${hill + 7} T100 ${hill + 4} V75 H0z" fill="#000" opacity=".42"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
