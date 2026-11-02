import type { Place } from '../types'
import { countryCode, countryDisplayName } from './countries'

// Offline place names from the globe's bundled data: Natural Earth cities and administrative
// areas (places10.json) and country label points (places.json). Used to name a pin and for the
// Country/City pickers, which offer everything the globe puts a label on.

export type LatLon = { lat: number; lon: number }

export type City = {
  id: number
  name: string
  country: string
  lat: number
  lon: number
  population: number
  /** A town or city, or an administrative area (a province, a state) the globe also labels. */
  kind: 'city' | 'area'
}

export type Country = {
  /** The Natural Earth name, as used on City.country. */
  key: string
  name: string
  code?: string
  /** Where to fly when it's picked, and how far out (globe radii above the surface). */
  center: LatLon
  range: number
}

export type PlaceIndex = {
  cities: City[]
  countries: Country[]
  citiesOf: (countryKey: string) => City[]
}

const url = (f: string) => `${import.meta.env.BASE_URL}globe/${f}`
const json = <T>(f: string) =>
  fetch(url(f)).then((r) => {
    if (!r.ok) throw new Error(`${f}: ${r.status}`)
    return r.json() as Promise<T>
  })

let index: Promise<PlaceIndex> | null = null

export function loadPlaceIndex(): Promise<PlaceIndex> {
  index ??= Promise.all([
    json<{ places: [string, number, number, number, number, number, string][]; regions: [string, number, number, number, string][] }>('places10.json'),
    json<{ countries: [string, number, number, number, number, number, string, number][] }>('places.json'),
  ])
    .then(([p10, p]) => {
      // Natural Earth keeps two lists, and the globe labels both: `places` are cities, with a
      // population; `regions` are the administrative areas, which is where a lot of real cities
      // sit — all of Metro Manila outside Quezon City, for one. Anything the globe names should
      // be choosable here, so both go in.
      const placeholder = /^[A-Z]{3}-\d/ // "PHL-99 (Philippines minor island)" and its kind
      const cityCountries = new Set(p10.places.map((r) => r[6]))
      const rows = [
        ...p10.places.map(([name, lon, lat, , population, , country]) => ({ name, lon, lat, country, population, kind: 'city' as const })),
        ...p10.regions
          // the rest of that list's leftovers are filed under non-countries (Null Island, Scarborough Reef)
          .filter(([name, , , , country]) => !placeholder.test(name) && (cityCountries.has(country) || countryCode(country)))
          .map(([name, lon, lat, , country]) => ({ name, lon, lat, country, population: 0, kind: 'area' as const })),
      ]

      // The two lists spell some countries differently ("Czechia" against "Czech Republic"), so
      // they're grouped by ISO code where there is one. Cities come first, so their spelling wins.
      const groupOf = (country: string) => countryCode(country) ?? country
      const countryName = new Map<string, string>()
      for (const r of rows) {
        const group = groupOf(r.country)
        if (!countryName.has(group)) countryName.set(group, r.country)
      }

      const cities: City[] = []
      const byCountry = new Map<string, City[]>()
      const seen = new Set<string>()
      for (const r of rows) {
        const country = countryName.get(groupOf(r.country))!
        // a place in both lists (Quezon City, Cebu) keeps its city entry, which has the population
        const once = `${country}\u0000${r.name.toLowerCase()}`
        if (seen.has(once)) continue
        seen.add(once)
        const city: City = { id: cities.length, name: r.name, country, lat: r.lat, lon: r.lon, population: r.population, kind: r.kind }
        cities.push(city)
        const list = byCountry.get(country)
        if (list) list.push(city)
        else byCountry.set(country, [city])
      }

      // label points from places.json, matched by ISO code because the two files spell some names differently
      const labels = new Map<string, { lat: number; lon: number; size: number }>()
      for (const [name, lon, lat, , , , , size] of p.countries) {
        const code = countryCode(name)
        if (code && !labels.has(code)) labels.set(code, { lat, lon, size })
      }

      const collator = new Intl.Collator('en')
      for (const list of byCountry.values()) list.sort((a, b) => collator.compare(a.name, b.name))

      const countries: Country[] = [...byCountry.entries()]
        .map(([key, list]) => {
          const code = countryCode(key)
          const label = code ? labels.get(code) : undefined
          const biggest = list.reduce((a, b) => (b.population > a.population ? b : a))
          return {
            key,
            name: countryDisplayName(key),
            code,
            center: label ? { lat: label.lat, lon: label.lon } : { lat: biggest.lat, lon: biggest.lon },
            // bigger countries are viewed from further out (Singapore ≈ 0.3, the Philippines ≈ 0.6, Russia 2.2)
            range: Math.min(2.2, Math.max(0.3, 0.27 + (label?.size ?? 4) * 0.055)),
          }
        })
        .sort((a, b) => collator.compare(a.name, b.name))

      return { cities, countries, citiesOf: (key: string) => byCountry.get(key) ?? [] }
    })
    .catch((e) => {
      index = null // let a later call retry
      throw e
    })
  return index
}

const R = 6371
const rad = Math.PI / 180

/** Great-circle distance in km. */
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function nearestCity(cities: City[], lat: number, lon: number): { city: City; km: number } {
  let city = cities[0], km = Infinity
  for (const c of cities) {
    const d = distanceKm(lat, lon, c.lat, c.lon)
    if (d < km) {
      city = c
      km = d
    }
  }
  return { city, km }
}

/**
 * How close the pin has to be before a post is named after an administrative area rather than a
 * town. Deliberately tight: measured against the bundled data, 5 km leaves 99.7% of pins named
 * exactly as they were before areas joined the list, while still naming the ones that land on a
 * city that only exists in that list. At 25 km it was 91%, renaming Southampton to Hampshire.
 */
const AREA_KM = 5

/**
 * A post's place: named after the nearest city ("Near …" when that city is over 40 km away).
 *
 * An administrative name is used only when the pin is all but standing on it — a pin inside
 * Caloocan City should say so, but a quiet spot in open country belongs to the nearest town,
 * not to whichever province or state happens to have its label point closest.
 */
export function placeNear(cities: City[], at: LatLon): Place {
  let town: City | undefined, townKm = Infinity
  let area: City | undefined, areaKm = Infinity
  for (const c of cities) {
    const d = distanceKm(at.lat, at.lon, c.lat, c.lon)
    if (c.kind === 'city') {
      if (d < townKm) [town, townKm] = [c, d]
    } else if (d < areaKm) [area, areaKm] = [c, d]
  }
  const useArea = area && areaKm <= AREA_KM && areaKm < townKm
  const city = (useArea ? area : town) ?? cities[0]
  const km = useArea ? areaKm : townKm
  return {
    name: km <= 40 ? city.name : `Near ${city.name}`,
    country: countryDisplayName(city.country),
    countryCode: countryCode(city.country),
    lat: at.lat,
    lon: at.lon,
  }
}

