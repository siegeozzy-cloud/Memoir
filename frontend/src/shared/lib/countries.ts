// Country names in the bundled city data (Natural Earth) mapped to ISO codes, for flags.

const key = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

// Natural Earth names that don't match the standard English region names.
const ALIASES: Record<string, string> = {
  turkey: 'TR',
  guineabissau: 'GW',
  congokinshasa: 'CD',
  congobrazzaville: 'CG',
  thegambia: 'GM',
  aland: 'AX',
  ivorycoast: 'CI',
  myanmar: 'MM',
  somaliland: 'SO',
  palestine: 'PS',
  northerncyprus: 'CY',
  unitedstatesofamerica: 'US',
  vatican: 'VA',
  necwzealand: 'NZ',
  chathamislands: 'NZ',
  kermadecislands: 'NZ',
  unitedstatesvirginislands: 'VI',
  southgeorgiaandtheislands: 'GS',
  svalbardandjanmayenislands: 'SJ',
  federatedstatesofmicronesia: 'FM',
  macausar: 'MO',
  hongkongsar: 'HK',
  thebahamas: 'BS',
  easttimor: 'TL',
  // standard names use "St." for these
  saintvincentandthegrenadines: 'VC',
  saintlucia: 'LC',
  saintkittsandnevis: 'KN',
}

// Tidier display names for a few Natural Earth spellings.
const DISPLAY: Record<string, string> = {
  'Necw Zealand': 'New Zealand',
  'Macau S.A.R': 'Macau',
  'Hong Kong S.A.R.': 'Hong Kong',
  'Congo (Kinshasa)': 'DR Congo',
  'Congo (Brazzaville)': 'Congo',
  'United States of America': 'United States',
}

let byName: Map<string, string> | null = null

function regionIndex() {
  if (byName) return byName
  byName = new Map()
  const names = new Intl.DisplayNames(['en'], { type: 'region' })
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b)
      try {
        const n = names.of(code)
        if (n && n !== code) byName.set(key(n), code)
      } catch {
        // not a region code
      }
    }
  }
  return byName
}

export function countryCode(name: string): string | undefined {
  const k = key(name)
  return ALIASES[k] ?? regionIndex().get(k)
}

export const countryDisplayName = (name: string) => DISPLAY[name] ?? name

/** 🇵🇭 from "PH". (Windows shows the two letters instead of a flag.) */
export const flagEmoji = (code: string) => String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
