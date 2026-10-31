type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string }

const LABELS = ['Standby', 'Weak', 'Fair', 'Good', 'Strong']

/** A rough guide for the meter under a new password: length counts most, then a mix of character kinds. */
export function passwordStrength(password: string): Strength {
  if (!password) return { score: 0, label: LABELS[0] }
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z\d]/].filter((re) => re.test(password)).length
  const n = password.length
  let points = (n >= 8 ? 1 : 0) + (n >= 12 ? 1 : 0) + (n >= 16 ? 1 : 0) + (kinds >= 2 ? 1 : 0) + (kinds >= 3 ? 1 : 0)
  if (n < 8) points = 0 // too short to be anything but weak
  const score = Math.max(1, Math.min(4, points)) as Strength['score']
  return { score, label: LABELS[score] }
}
