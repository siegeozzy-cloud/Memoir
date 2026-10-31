import type { Place } from '../types'
import { countryCode, countryDisplayName } from './countries'

// Offline place names from the globe's bundled data: 7,342 Natural Earth cities (places10.json)
// and country label points (places.json). Used to name a pin and for the Country/City pickers.

export type LatLon = { lat: number; lon: number }

export type City = { id: number; name: string; country: string; lat: number; lon: number; population: number }

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
    json<{ places: [string, number, number, number, number, number, string][] }>('places10.json'),
    json<{ countries: [string, number, number, number, number, number, string, number][] }>('places.json'),
  ])
    .then(([p10, p]) => {
      const cities: City[] = p10.places.map(([name, lon, lat, , population, , country], id) => ({ id, name, country, lat, lon, population }))

      // label points from places.json, matched by ISO code because the two files spell some names differently
      const labels = new Map<string, { lat: number; lon: number; size: number }>()
      for (const [name, lon, lat, , , , , size] of p.countries) {
        const code = countryCode(name)
        if (code && !labels.has(code)) labels.set(code, { lat, lon, size })
      }

      const byCountry = new Map<string, City[]>()
      for (const c of cities) {
        const list = byCountry.get(c.country)
        if (list) list.push(c)
        else byCountry.set(c.country, [c])
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

/** A post's place: named after the nearest city ("Near …" when that city is over 40 km away). */
export function placeNear(cities: City[], at: LatLon): Place {
  const { city, km } = nearestCity(cities, at.lat, at.lon)
  return {
    name: km <= 40 ? city.name : `Near ${city.name}`,
    country: countryDisplayName(city.country),
    countryCode: countryCode(city.country),
    lat: at.lat,
    lon: at.lon,
  }
}

