const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** "Oct 09, 2026" */
export const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })

/** "Oct 29" */
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** "3:20 PM" */
export const clock = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** "Today 3:20 PM", "Yesterday 9:05 AM", "Tue 8:00 PM", "Oct 2, 4:15 PM" */
export function stamp(iso: string, now = new Date()) {
  const d = new Date(iso)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, now)) return `Today ${clock(d)}`
  if (sameDay(d, yesterday)) return `Yesterday ${clock(d)}`
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return `${d.toLocaleDateString([], { weekday: 'short' })} ${clock(d)}`
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
