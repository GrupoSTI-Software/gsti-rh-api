import Assist from '#models/assist'
import { parseAssistLocation } from './assist_source.rules.js'
import env from '#start/env'
import type { ReverseGeocoder } from './reverse_geocoder.js'
import NominatimReverseGeocoder from './nominatim_reverse_geocoder.js'
import GoogleReverseGeocoder from './google_reverse_geocoder.js'

/**
 * Proveedor de direcciones: Google si hay llave de servidor; si no,
 * Nominatim (OpenStreetMap), que no pide llave.
 */
export function resolveReverseGeocoder(
  googleApiKey: string | undefined = env.get('GOOGLE_MAPS_API_KEY')
): ReverseGeocoder {
  return googleApiKey ? new GoogleReverseGeocoder(googleApiKey) : new NominatimReverseGeocoder()
}

/** Resultado de pedir la dirección aproximada de una checada. */
export type AssistAddressResult =
  | { status: 'ok'; address: string | null }
  | { status: 'not-found' }
  | { status: 'no-location' }
  | { status: 'unavailable' }

/**
 * Dirección aproximada de una checada con coordenadas. Va aparte del detalle
 * del origen: depende de un servicio externo, y si falla el cliente la
 * reintenta sin volver a pedir lo demás.
 */
export default class AssistAddressService {
  constructor(private readonly geocoder: ReverseGeocoder = resolveReverseGeocoder()) {}

  async find(assistId: number): Promise<AssistAddressResult> {
    const assist = await Assist.query().where('assistId', assistId).first()
    if (!assist) return { status: 'not-found' }

    const location = parseAssistLocation(
      assist.assistLatitude,
      assist.assistLongitude,
      assist.assistPrecision
    )
    if (!location) return { status: 'no-location' }

    try {
      return {
        status: 'ok',
        address: await this.geocoder.reverse(location.latitude, location.longitude),
      }
    } catch {
      return { status: 'unavailable' }
    }
  }
}
