import type { ReverseGeocoder } from './reverse_geocoder.js'

const GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json'

const TIMEOUT_MS = 5000

const CACHE_LIMIT = 1000

/**
 * Vigencia de una dirección en caché. Los términos de Google Maps Platform no
 * permiten guardar sus resultados más de 30 días; con un día sobra para no
 * repetir la consulta de una misma oficina.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** Respuesta de la Geocoding API que se usa. */
interface GoogleGeocodeResponse {
  status: string
  error_message?: string
  results?: Array<{ formatted_address?: string }>
}

/** Estados con los que la consulta respondió, aunque no haya dirección. */
const ANSWERED_STATUSES: ReadonlySet<string> = new Set(['OK', 'ZERO_RESULTS'])

/**
 * Quita el país del final: todas las checadas son de México y en el drawer
 * solo ocupa espacio.
 */
export function trimCountry(address: string): string {
  return address.replace(/,\s*(México|Mexico|Méx\.)$/i, '').trim()
}

/**
 * Direcciones aproximadas con la Geocoding API de Google. Numera las casas
 * mucho mejor que OpenStreetMap en México. Lo resuelto se guarda un día en
 * memoria por coordenada redondeada (~1 m).
 *
 * Un estado distinto de `OK` o `ZERO_RESULTS` (API apagada, llave rechazada,
 * cuota agotada) lanza: el cliente ofrece reintentar.
 */
export default class GoogleReverseGeocoder implements ReverseGeocoder {
  private static cache = new Map<string, { address: string | null; expiresAt: number }>()

  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = () => Date.now()
  ) {}

  async reverse(latitude: number, longitude: number): Promise<string | null> {
    const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`
    const cached = GoogleReverseGeocoder.cache.get(key)
    if (cached && cached.expiresAt > this.now()) return cached.address

    const url = new URL(GEOCODING_URL)
    url.searchParams.set('latlng', `${latitude},${longitude}`)
    url.searchParams.set('language', 'es')
    url.searchParams.set('key', this.apiKey)

    const response = await this.fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) {
      throw new Error(`Google Geocoding respondió ${response.status}`)
    }
    const body = (await response.json()) as GoogleGeocodeResponse
    if (!ANSWERED_STATUSES.has(body.status)) {
      throw new Error(`Google Geocoding: ${body.status} ${body.error_message ?? ''}`.trim())
    }

    const formatted = body.results?.[0]?.formatted_address
    const address = formatted ? trimCountry(formatted) : null

    const cache = GoogleReverseGeocoder.cache
    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, { address, expiresAt: this.now() + CACHE_TTL_MS })
    return address
  }

  /** Solo para pruebas: vacía la caché. */
  static resetForTests(): void {
    GoogleReverseGeocoder.cache.clear()
  }
}
