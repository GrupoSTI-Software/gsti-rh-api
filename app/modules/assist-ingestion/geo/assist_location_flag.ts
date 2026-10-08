import { ASSIST_LOCATION_FLAG } from '#constants/assist_location_flag'
import type { AssistLocationFlag } from '#constants/assist_location_flag'
import type { AssistIngestionGeo } from '../dto/assist_ingestion.dto.js'

/**
 * Decide la marca de ubicación de una checada que ya pasó la comprobación de zona
 * (VLRH-H1790812613756, regla 2).
 *
 * - Sin latitud o sin longitud: sin marca, traiga lo que traiga el indicador.
 * - Indicador `true`: "Ubicación simulada".
 * - Indicador `false`: sin marca.
 * - Indicador ausente o `null`: "Ubicación no verificada".
 *
 * Compara con `=== true` / `=== false` a propósito: `!!isMocked` o `?? false`
 * confundirían "no simulada" con "no lo dijo".
 *
 * @param geo - Coordenadas e indicador tal como los declaró el equipo de origen.
 * @returns La marca a guardar, o `null` si la checada queda sin marca.
 */
export function resolveAssistLocationFlag(geo: AssistIngestionGeo): AssistLocationFlag | null {
  if (geo.latitude === null || geo.longitude === null) return null
  if (geo.isMocked === true) return ASSIST_LOCATION_FLAG.SIMULATED
  if (geo.isMocked === false) return null
  return ASSIST_LOCATION_FLAG.UNVERIFIED
}
