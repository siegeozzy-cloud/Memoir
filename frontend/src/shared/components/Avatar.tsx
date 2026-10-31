import type { User } from '../types'

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// Placeholder until people upload pictures: a mirrored 5×5 pixel pattern, unique per user,
// on the purple tile from the design.
function PixelPattern({ id }: { id: string }) {
  const h = hash(id)
  const hue = h % 360
  const cells: [number, number][] = []
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if ((h >> (y * 3 + x)) & 1) {
        cells.push([x, y])
        if (x < 2) cells.push([4 - x, y])
      }
    }
  }
  return (
    <svg viewBox="-1.5 -1.5 8 8" width="100%" height="100%" aria-hidden="true" shapeRendering="crispEdges">
      <rect x="-1.5" y="-1.5" width="8" height="8" fill="#8d62c8" />
      {cells.map(([x, y]) => (
        <rect key={`${x},${y}`} x={x} y={y} width="1" height="1" fill={`hsl(${hue} 70% 82%)`} />
      ))}
    </svg>
  )
}

export default function Avatar({ user, size = 44, radius = 10 }: { user: User; size?: number; radius?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, borderRadius: radius }} aria-hidden="true">
      {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <PixelPattern id={user.id} />}
    </span>
  )
}
