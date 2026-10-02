import type { ReverseGeocoder } from './reverse_geocoder.js'

const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'

/** La política de uso de Nominatim permite una consulta por segundo. */
const MIN_INTERVAL_MS = 1100

const TIMEOUT_MS = 5000

const CACHE_LIMIT = 1000

/** La política exige identificar la aplicación que consulta. */
const USER_AGENT = 'Valanserh/1.0 (+https://app.valanserh.com)'

/** Partes de la dirección que devuelve Nominatim (`addressdetails=1`). */
interface NominatimAddress {
  road?: string
  house_number?: string
  neighbourhood?: string
  suburb?: string
  quarter?: string
  city?: string
  town?: string
  village?: string
  municipality?: string
  state?: string
}

interface NominatimReverseResponse {
  display_name?: string
  address?: NominatimAddress
  error?: string
}

/**
 * Arma una dirección corta: calle y número, colonia, ciudad y estado. Si
 * Nominatim no trae partes, se usa su nombre completo.
 */
export function formatNominatimAddress(response: NominatimReverseResponse): string | null {
  const address = response.address
  if (address) {
    const street = [address.road, address.house_number].filter(Boolean).join(' ')
    const parts = [
      street,
      address.neighbourhood ?? address.suburb ?? address.quarter,
      address.city ?? address.town ?? address.village ?? address.municipality,
      address.state,
    ].filter((part): part is string => !!part)
    if (parts.length > 0) return parts.join(', ')
  }
  return response.display_name ?? null
}

/**
 * Direcciones aproximadas con Nominatim (OpenStreetMap).
 *
 * Las consultas se encadenan para no pasar de una por segundo, y lo resuelto se
 * guarda en memoria por coordenada redondeada (~1 m), así que abrir varias
 * veces la misma checada no vuelve a salir a la red.
 */
export default class NominatimReverseGeocoder implements ReverseGeocoder {
  private static cache = new Map<string, string | null>()
  private static queue: Promise<unknown> = Promise.resolve()
  private static lastRequestAt = 0

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async reverse(latitude: number, longitude: number): Promise<string | null> {
    const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`
    if (NominatimReverseGeocoder.cache.has(key)) {
      return NominatimReverseGeocoder.cache.get(key) ?? null
    }

    const request = NominatimReverseGeocoder.queue.then(() => this.request(latitude, longitude))
    // La cola sigue aunque una consulta falle.
    NominatimReverseGeocoder.queue = request.catch(() => undefined)
    const address = await request

    const cache = NominatimReverseGeocoder.cache
    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, address)
    return address
  }

  private async request(latitude: number, longitude: number): Promise<string | null> {
    const wait = NominatimReverseGeocoder.lastRequestAt + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    NominatimReverseGeocoder.lastRequestAt = Date.now()

    const url = new URL(NOMINATIM_REVERSE_URL)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('lat', String(latitude))
    url.searchParams.set('lon', String(longitude))
    url.searchParams.set('zoom', '18')
    url.searchParams.set('addressdetails', '1')

    const response = await this.fetcher(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`Nominatim respondió ${response.status}`)
    }
    const body = (await response.json()) as NominatimReverseResponse
    if (body.error) return null
    return formatNominatimAddress(body)
  }

  /** Solo para pruebas: vacía la caché y reinicia la cola. */
  static resetForTests(): void {
    NominatimReverseGeocoder.cache.clear()
    NominatimReverseGeocoder.queue = Promise.resolve()
    NominatimReverseGeocoder.lastRequestAt = 0
  }
}
