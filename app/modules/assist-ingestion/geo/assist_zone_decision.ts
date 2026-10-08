import { distanceToRingMeters, haversineMeters, isPointInRing } from '#utils/geo_polygon'
import type { GeoPoint } from '#utils/geo_polygon'
import type { ZoneGeometry } from '#utils/zone_geometry_parser'
import { ASSIST_ZONE_PRECISION_CAP_METERS } from '../assist_ingestion.constants.js'

/** Lo que la decisión necesita saber del empleado y su empresa. */
export interface AssistZoneContext {
  /** Asignaciones vigentes del empleado en su empresa, evaluables o no. */
  assignmentCount: number
  /** Figuras interpretables de las zonas asignadas que pertenecen a su empresa. */
  geometries: ZoneGeometry[]
  /** Margen de tolerancia de la empresa, en metros. */
  toleranceMeters: number
}

/** Veredicto geográfico de una checada. */
export type AssistZoneDecision = 'inside' | 'outside' | 'no-zones' | 'not-evaluable'

/**
 * Holgura que se acepta alrededor de las zonas (regla 5).
 *
 * La mayor entre el margen de la empresa y el error que reporta el teléfono,
 * este último topado para que un aparato no ensanche la zona declarando un error
 * enorme. Con margen 0 la holgura es 0 y el error del teléfono no cuenta: la
 * empresa pidió registrar estrictamente dentro del área. Un error nulo, negativo
 * o no finito no aporta.
 */
export function assistZoneSlackMeters(toleranceMeters: number, precision: number | null): number {
  if (toleranceMeters === 0) return 0
  const reported =
    precision !== null && Number.isFinite(precision) && precision > 0 ? precision : 0
  return Math.max(toleranceMeters, Math.min(reported, ASSIST_ZONE_PRECISION_CAP_METERS))
}

/**
 * Decide si la checada cae en alguna zona del empleado.
 *
 * Sin asignaciones no hay dónde registrar (regla 6); con asignaciones pero sin
 * figuras interpretables la zona no se puede evaluar (regla 7), y nunca se
 * acepta por omisión. Si no, basta con quedar dentro o a menos de la holgura de
 * alguna figura (regla 4).
 */
export function decideZone(
  point: GeoPoint,
  precision: number | null,
  context: AssistZoneContext
): AssistZoneDecision {
  if (context.assignmentCount === 0) return 'no-zones'
  if (context.geometries.length === 0) return 'not-evaluable'

  const slack = assistZoneSlackMeters(context.toleranceMeters, precision)
  const inside = context.geometries.some((geometry) =>
    geometry.kind === 'ring'
      ? isPointInRing(point, geometry.ring) || distanceToRingMeters(point, geometry.ring) <= slack
      : haversineMeters(point, geometry.center) <= slack
  )
  return inside ? 'inside' : 'outside'
}
