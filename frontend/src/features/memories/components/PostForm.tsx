import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { UPLOAD } from '../../../app/config'
import { flagEmoji } from '../../../shared/lib/countries'
import { loadPlaceIndex, nearestCity, placeNear, type LatLon, type PlaceIndex } from '../../../shared/lib/places'
import type { Place, User } from '../../../shared/types'
import Avatar from '../../../shared/components/Avatar'
import { BackCircleIcon, PinIcon, PlusIcon, RemoveCircleIcon, SearchIcon } from './icons'
import { useDrop } from './usePhotoPicker'

export type Placement = {
  /** The post's pin on the globe (the app keeps it, the globe draws it). */
  pin: LatLon | null
  setPin: (pin: LatLon | null) => void
  /** While on, clicking the globe drops the pin and the pin can be dragged. */
  setPlacing: (on: boolean) => void
  flyTo: (to: LatLon, range: number) => void
}

type FormPhoto = { id: string; url: string; name: string; fromGps?: boolean }

type FormValues = { title: string; taggedIds: string[]; pin: LatLon; place: Place }

type Props = {
  head: { icon: ReactNode; title: ReactNode; subtitle: string }
  photos: FormPhoto[]
  onRemovePhoto: (id: string) => void
  /** False when the post is down to its last photo (a post keeps at least one). */
  canRemove?: boolean
  onAddFiles: (files: FileList) => void
  onBrowse: () => void
  errors: string[]
  friends: User[]
  placement: Placement
  /** Starting values (Edit fills these from the post). */
  initial?: { title: string; taggedIds: string[]; pin: LatLon }
  /** A photo's GPS position: places the pin if the location isn't set yet. */
  gps?: LatLon
  /** Photos were added or removed (counts as an unsaved change). */
  photosChanged?: boolean
  submitLabel: string
  /** Ask before Back throws away changes. */
  confirmDiscard?: boolean
  onSubmit: (values: FormValues) => Promise<void>
  onBack: () => void
}

const CITY_RANGE = 0.05 // about 320 km up: the street map, close enough to place the pin precisely
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const samePin = (a: LatLon | null | undefined, b: LatLon | null | undefined) => !!a && !!b && Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lon - b.lon) < 1e-7

// The Post / Edit form from the designs: photos, Tag Person/s, Album Name, Location.
export default function PostForm(props: Props) {
  const { head, photos, onRemovePhoto, canRemove = true, onAddFiles, onBrowse, errors, friends, placement, initial, gps, photosChanged = false } = props
  const { pin, setPin, setPlacing, flyTo } = placement
  const [places, setPlaces] = useState<PlaceIndex | null>(null)
  const [placesFailed, setPlacesFailed] = useState(false)
  const [chosenCountry, setChosenCountry] = useState('') // only used while there's no pin
  const [tagged, setTagged] = useState<Set<string>>(() => new Set(initial?.taggedIds))
  const [tagQuery, setTagQuery] = useState('')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const drop = useDrop(onAddFiles)
  // the location has been set (by the user, the post, or a photo's GPS); GPS arriving later won't move it
  const settled = useRef(!!initial)

  // clicking the globe drops the pin while the form is open; Edit starts at the post's place
  useEffect(() => {
    setPlacing(true)
    if (initial) {
      setPin(initial.pin)
      flyTo(initial.pin, 3)
    }
    return () => {
      setPlacing(false)
      setPin(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per form
  }, [])

  useEffect(() => {
    let cancelled = false
    loadPlaceIndex().then(
      (ix) => !cancelled && setPlaces(ix),
      () => !cancelled && setPlacesFailed(true),
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!gps || settled.current) return
    settled.current = true
    if (!pin) {
      setPin(gps)
      flyTo(gps, CITY_RANGE)
    }
  }, [gps, pin, setPin, flyTo])
  useEffect(() => {
    if (pin) settled.current = true // a click on the globe counts too
  }, [pin])

  // the Country and City boxes follow the pin; without a pin, Country is whatever was picked
  const near = pin && places ? nearestCity(places.cities, pin.lat, pin.lon) : null
  const countryKey = near ? near.city.country : chosenCountry
  const cities = places && countryKey ? places.citiesOf(countryKey) : []

  const pickCountry = (key: string) => {
    settled.current = true
    setChosenCountry(key)
    setPin(null)
    const c = places?.countries.find((x) => x.key === key)
    if (c) flyTo(c.center, c.range)
  }
  const pickCity = (id: string) => {
    const city = places?.cities[Number(id)]
    if (!city) return
    settled.current = true
    const at = { lat: city.lat, lon: city.lon }
    setPin(at)
    flyTo(at, CITY_RANGE)
  }

  const visibleFriends = useMemo(() => {
    const q = norm(tagQuery.trim())
    return q ? friends.filter((f) => norm(f.name).includes(q)) : friends
  }, [friends, tagQuery])

  const dirty =
    photosChanged ||
    !initial ||
    title.trim() !== initial.title.trim() ||
    !samePin(pin, initial.pin) ||
    tagged.size !== initial.taggedIds.length ||
    initial.taggedIds.some((id) => !tagged.has(id))
  const ready = !!pin && photos.length > 0 && (!!places || placesFailed) && !busy && dirty

  const submit = async () => {
    if (!pin || !ready) return
    setBusy(true)
    setSubmitError('')
    const place = places ? placeNear(places.cities, pin) : { name: `${pin.lat.toFixed(3)}, ${pin.lon.toFixed(3)}`, country: 'Unknown', lat: pin.lat, lon: pin.lon }
    try {
      await props.onSubmit({ title: title.trim(), taggedIds: [...tagged], pin, place })
    } catch {
      setSubmitError('Couldn’t save. Check your connection and try again.')
      setBusy(false)
    }
  }

  const back = () => {
    if (props.confirmDiscard && dirty) setConfirming(true)
    else props.onBack()
  }

  return (
    <div className="cap-view upload is-details">
      <div className="upload-head">
        <span className="upload-badge">{head.icon}</span>
        <div>
          <h2>{head.title}</h2>
          <p>{head.subtitle}</p>
        </div>
      </div>

      <div className="post-body">
        {/* the frame stays still; the grid scrolls inside it, so the scrollbar sits within the border */}
        <div className={`post-photos${drop.over ? ' is-over' : ''}`} {...drop.props}>
          <div className="post-photos-scroll">
            <ul className="post-grid" aria-label={`${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`}>
              {photos.map((p) => (
                <li key={p.id}>
                  <Preview url={p.url} name={p.name} />
                  {p.fromGps && (
                    <span className="tile-gps" title="Location read from this photo">
                      <PinIcon size={11} />
                    </span>
                  )}
                  <button
                    type="button"
                    className="tile-x"
                    aria-label={`Remove ${p.name}`}
                    title={canRemove ? 'Remove' : 'A post needs at least one photo'}
                    onClick={() => onRemovePhoto(p.id)}
                    disabled={busy || !canRemove}
                  >
                    <RemoveCircleIcon />
                  </button>
                </li>
              ))}
              {photos.length < UPLOAD.maxFiles && (
                <li>
                  <button type="button" className="tile-add" onClick={onBrowse} disabled={busy} aria-label="Add more photos">
                    <PlusIcon />
                  </button>
                </li>
              )}
            </ul>
          </div>
        </div>
        {errors.length > 0 && <Errors list={errors} />}

        <div className="post-form">
          <div className="post-col">
            <h3 id="tag-label">Tag Person/s</h3>
            <div className="tag-box">
              <label className="tag-search">
                <SearchIcon size={18} />
                <input type="search" value={tagQuery} placeholder="Search" aria-label="Search friends to tag" onChange={(e) => setTagQuery(e.target.value)} />
              </label>
              <ul className="tag-list" aria-labelledby="tag-label">
                {visibleFriends.length === 0 && <li className="tag-empty">No friends match “{tagQuery.trim()}”.</li>}
                {visibleFriends.map((f) => (
                  <li key={f.id}>
                    <label>
                      <input
                        type="checkbox"
                        className="tag-check"
                        checked={tagged.has(f.id)}
                        onChange={() =>
                          setTagged((t) => {
                            const n = new Set(t)
                            if (n.has(f.id)) n.delete(f.id)
                            else n.add(f.id)
                            return n
                          })
                        }
                      />
                      <Avatar user={f} size={34} radius={9} />
                      <span>{f.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="post-col">
            <label className="post-field">
              <h3>Album Name</h3>
              <input className="post-input" value={title} maxLength={60} placeholder="Enter a Name" onChange={(e) => setTitle(e.target.value)} title="Leave empty to use the place name" />
            </label>
            <h3 id="loc-label">Location</h3>
            <select className="post-select" aria-label="Country" value={countryKey} disabled={!places} onChange={(e) => pickCountry(e.target.value)}>
              <option value="" disabled>
                {places ? 'Choose a Country' : placesFailed ? 'Places unavailable' : 'Loading places…'}
              </option>
              {places?.countries.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.code ? `${flagEmoji(c.code)}  ` : ''}
                  {c.name}
                </option>
              ))}
            </select>
            <select className="post-select" aria-label="City" value={near ? String(near.city.id) : ''} disabled={!cities.length} onChange={(e) => pickCity(e.target.value)}>
              <option value="" disabled>
                Select a City
              </option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="loc-status" aria-live="polite">
              {pin ? (
                <>
                  <PinIcon size={12} /> {near && near.km > 40 ? `Near ${near.city.name} · ` : ''}
                  {pin.lat.toFixed(4)}, {pin.lon.toFixed(4)}
                  {samePin(pin, gps) ? ' · from the photo' : ''}
                </>
              ) : (
                'Pick a city, or click the map to drop the pin.'
              )}
            </p>
          </div>
        </div>
        {submitError && <Errors list={[submitError]} />}
      </div>

      {confirming ? (
        <div className="cap-foot is-confirm" role="alertdialog" aria-label="Unsaved changes">
          <p>You have unsaved changes. Leave without saving?</p>
          <div>
            <button type="button" className="cap-btn" onClick={() => setConfirming(false)} autoFocus>
              Keep editing
            </button>
            <button type="button" className="cap-btn is-danger is-solid" onClick={props.onBack}>
              Discard
            </button>
          </div>
        </div>
      ) : (
        <div className="cap-foot">
          <button type="button" className="cap-btn has-icon" onClick={back} disabled={busy}>
            <BackCircleIcon /> Back
          </button>
          <button
            type="button"
            className="cap-btn is-primary"
            onClick={submit}
            disabled={!ready}
            title={!pin ? 'Set the location first' : !dirty ? 'Nothing to save yet' : undefined}
          >
            {busy ? `${props.submitLabel === 'Post' ? 'Posting' : 'Saving'}…` : props.submitLabel}
          </button>
        </div>
      )}
    </div>
  )
}

function Preview({ url, name }: { url: string; name: string }) {
  const [broken, setBroken] = useState(false)
  // Chrome and Firefox can't show HEIC; the server will convert it when real uploads exist
  if (broken) return <span className="tile-fallback">{name.split('.').pop()?.toUpperCase() || 'Photo'}</span>
  return <img src={url} alt={name} onError={() => setBroken(true)} />
}

export function Errors({ list }: { list: string[] }) {
  return (
    <ul className="upload-errors" role="alert">
      {list.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  )
}
