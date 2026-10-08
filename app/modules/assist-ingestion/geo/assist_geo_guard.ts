import {
  ASSIST_INGESTION_COORDINATES_INVALID,
  ASSIST_INGESTION_NO_AUTHORIZED_ZONE,
  ASSIST_INGESTION_OUTSIDE_ZONE,
  ASSIST_INGESTION_ZONE_NOT_EVALUABLE,
} from '../assist_ingestion.rejections.js'
import type {
  AssistIngestionRecord,
  AssistIngestionRejection,
} from '../dto/assist_ingestion.dto.js'
import { AssistZoneContextLoader } from './assist_zone_context.loader.js'
import type { AssistZoneContextCache } from './assist_zone_context.loader.js'
import { decideZone } from './assist_zone_decision.js'
import type { AssistZoneDecision } from './assist_zone_decision.js'
import type { GeoPoint } from '#utils/geo_polygon'

/** Lo que el guard necesita del empleado ya resuelto. */
export interface AssistGeoSubject {
  authorizeAnyZones: boolean
}

/** Resultado de un paso: sigue al siguiente, acepta ya o rechaza. */
export type AssistGeoStepVerdict =
  | { kind: 'continue' }
  | { kind: 'accept' }
  | { kind: 'reject'; rejection: AssistIngestionRejection }

/** Datos con los que corre cada paso. */
interface AssistGeoStepInput {
  record: AssistIngestionRecord
  subject: AssistGeoSubject
  cache: AssistZoneContextCache
}

type AssistGeoStep = (input: AssistGeoStepInput) => Promise<AssistGeoStepVerdict>

const CONTINUE: AssistGeoStepVerdict = { kind: 'continue' }
const ACCEPT: AssistGeoStepVerdict = { kind: 'accept' }
const reject = (rejection: AssistIngestionRejection): AssistGeoStepVerdict => ({
  kind: 'reject',
  rejection,
})

/** Punto válido de la checada; `null` si las coordenadas son imposibles (regla 3). */
function toGeoPoint(latitude: number | null, longitude: number | null): GeoPoint | null {
  if (latitude === null || longitude === null) return null
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return { lat: latitude, lng: longitude }
}

/** Rechazo de cada veredicto de zona; `null` cuando la checada entra. */
function rejectionFor(decision: AssistZoneDecision): AssistIngestionRejection | null {
  switch (decision) {
    case 'inside':
      return null
    case 'outside':
      return ASSIST_INGESTION_OUTSIDE_ZONE
    case 'no-zones':
      return ASSIST_INGESTION_NO_AUTHORIZED_ZONE
    case 'not-evaluable':
      return ASSIST_INGESTION_ZONE_NOT_EVALUABLE
    default:
      return decision satisfies never
  }
}

/**
 * Comprobación de zona de una checada (VLRH-H1790812613754).
 *
 * La decisión es del sistema (regla 10) y aplica igual en el alta unitaria y en
 * la entrega de varias (regla 11). Exenta solo la checada que llega sin latitud
 * ni longitud: el canal que declare el cliente no cuenta (regla 1). El rechazo no
 * lleva coordenadas, distancias, zonas ni margen, y nada de eso se registra en log.
 *
 * Los pasos corren en orden: coordenadas, "cualquier zona", zona. La marca de
 * ubicación simulada (VLRH-H1790812613756) no es un paso: se calcula en la
 * ingesta cuando `check` devuelve `null`.
 */
export class AssistGeoGuard {
  private readonly loader: AssistZoneContextLoader

  private readonly steps: readonly AssistGeoStep[] = [
    async ({ record }) =>
      toGeoPoint(record.geo.latitude, record.geo.longitude)
        ? CONTINUE
        : reject(ASSIST_INGESTION_COORDINATES_INVALID),
    async ({ subject }) => (subject.authorizeAnyZones ? ACCEPT : CONTINUE),
    async ({ record, cache }) => {
      const point = toGeoPoint(record.geo.latitude, record.geo.longitude)
      if (!point) return reject(ASSIST_INGESTION_COORDINATES_INVALID)
      const context = await this.loader.load(record.employeeId, record.businessUnitId, cache)
      const rejection = rejectionFor(decideZone(point, record.geo.precision, context))
      return rejection ? reject(rejection) : ACCEPT
    },
  ]

  constructor(loader: AssistZoneContextLoader = new AssistZoneContextLoader()) {
    this.loader = loader
  }

  createCache(): AssistZoneContextCache {
    return this.loader.createCache()
  }

  /**
   * Rechazo de la checada, o `null` si se acepta.
   *
   * @param record - Checada con empleado y empresa ya resueltos.
   * @param subject - Atributos del empleado que deciden la comprobación.
   * @param cache - Caché de la entrega en curso (`createCache`).
   */
  async check(
    record: AssistIngestionRecord,
    subject: AssistGeoSubject,
    cache: AssistZoneContextCache
  ): Promise<AssistIngestionRejection | null> {
    // Sin latitud ni longitud: captura manual, relojes checadores, pines sin
    // mapear y kiosco encolado. Queda exenta sin consultar nada (regla 1).
    if (record.geo.latitude === null && record.geo.longitude === null) return null

    for (const step of this.steps) {
      const verdict = await step({ record, subject, cache })
      if (verdict.kind === 'reject') return verdict.rejection
      if (verdict.kind === 'accept') return null
    }
    return null
  }
}
