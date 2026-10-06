import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { GeoPoint } from '#utils/geo_polygon'

/**
 * Fixtures geográficas de la comprobación de zona (VLRH-H1790812613754, anexo A).
 *
 * Fuente única de zonas y puntos de prueba: la reutiliza VLRH-H1790812613756 sin
 * editarla. Las distancias del anexo se calcularon con el mismo algoritmo que el
 * código (haversine, R = 6 371 000 m); se comparan con tolerancia de 0.5 m.
 *
 * Las filas se insertan con SQL directo: `zones` y `employee_zones` llevan filtro
 * de empresa y sus ganchos resuelven la empresa desde el contexto, y aquí hace
 * falta poder sembrar justo lo que el código debe rechazar (zona sin empresa o de
 * otra empresa).
 */

/** Cuadrado de 208 m por 222 m en Guadalajara, anillo cerrado. */
const Z1_RING: readonly [number, number][] = [
  [-103.355, 20.673],
  [-103.353, 20.673],
  [-103.353, 20.675],
  [-103.355, 20.675],
  [-103.355, 20.673],
]

const featureCollection = (...geometries: object[]): string =>
  JSON.stringify({
    type: 'FeatureCollection',
    features: geometries.map((geometry) => ({ type: 'Feature', properties: {}, geometry })),
  })

const Z1_POLYGON_GEOMETRY = { type: 'Polygon', coordinates: [Z1_RING] }

/** Variantes de `zones.zone_polygon` del anexo A.1. */
export const ASSIST_GEO_ZONES = {
  Z1_POLYGON: featureCollection(Z1_POLYGON_GEOMETRY),
  Z1_OPEN_LINESTRING: featureCollection({ type: 'LineString', coordinates: Z1_RING.slice(0, 4) }),
  Z_POINT: featureCollection({ type: 'Point', coordinates: [-103.354, 20.674] }),
  Z_MIXED: featureCollection({ type: 'Point', coordinates: [-103.4, 20.7] }, Z1_POLYGON_GEOMETRY),
  Z_CORRUPT: '{"type":"FeatureCollection","features":[',
  Z_EMPTY: '{"type":"FeatureCollection","features":[]}',
} as const

/** Punto de prueba con su distancia esperada del anexo A.2. */
export interface AssistGeoFixturePoint extends GeoPoint {
  /** Distancia en metros al borde de Z1 (o al centro de `Z_POINT`); 0 si cae dentro. */
  expectedMeters: number
}

/** Puntos del anexo A.2. */
export const ASSIST_GEO_POINTS = {
  CENTER: { lat: 20.674, lng: -103.354, expectedMeters: 104.03 },
  NORTH_30: { lat: 20.67527, lng: -103.354, expectedMeters: 30.02 },
  NORTH_45: { lat: 20.675405, lng: -103.354, expectedMeters: 45.03 },
  NORTH_80: { lat: 20.675719, lng: -103.354, expectedMeters: 79.95 },
  NORTH_120: { lat: 20.676079, lng: -103.354, expectedMeters: 119.98 },
  HOME: { lat: 20.68, lng: -103.36, expectedMeters: 761.36 },
  WEST_IN: { lat: 20.674, lng: -103.35495, expectedMeters: 5.2 },
  WEST_30: { lat: 20.674, lng: -103.355288, expectedMeters: 29.96 },
  POINT_40: { lat: 20.67436, lng: -103.354, expectedMeters: 40.03 },
  POINT_60: { lat: 20.67454, lng: -103.354, expectedMeters: 60.05 },
} as const satisfies Record<string, AssistGeoFixturePoint>

/** Cuerpo de checada con la ubicación de un punto de prueba. */
export function assistGeoBody(point: GeoPoint, precision: number | null = null) {
  return {
    assistLatitude: point.lat,
    assistLongitude: point.lng,
    assistPrecision: precision,
  }
}

const now = () => DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss')

/**
 * Crea una zona con la geometría dada.
 *
 * @param businessUnitId - Empresa dueña; `null` simula una zona sin backfill.
 * @param polygon - Contenido de `zone_polygon` (una de `ASSIST_GEO_ZONES`).
 * @param deleted - Crea la zona ya borrada.
 */
export async function createAssistGeoZone(
  businessUnitId: number | null,
  polygon: string,
  deleted = false
): Promise<number> {
  const [zoneId] = await db.table('zones').insert({
    business_unit_id: businessUnitId,
    zone_name: `Zona prueba ${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    zone_thumbnail: null,
    zone_address: 'Guadalajara, Jalisco',
    zone_polygon: polygon,
    zone_created_at: now(),
    zone_updated_at: now(),
    zone_deleted_at: deleted ? now() : null,
  })
  return Number(zoneId)
}

/** Asigna una zona al empleado dentro de su empresa. */
export async function assignAssistGeoZone(
  employeeId: number,
  businessUnitId: number,
  zoneId: number
): Promise<number> {
  const [employeeZoneId] = await db.table('employee_zones').insert({
    employee_id: employeeId,
    business_unit_id: businessUnitId,
    zone_id: zoneId,
    employee_zone_created_at: now(),
    employee_zone_updated_at: now(),
  })
  return Number(employeeZoneId)
}

/** Marca o desmarca "puede registrar asistencia en cualquier zona". */
export async function setAssistGeoAnyZone(employeeId: number, authorize: boolean): Promise<void> {
  await db
    .from('employees')
    .where('employee_id', employeeId)
    .update({ employee_authorize_any_zones: authorize ? 1 : 0 })
}

/** Fija el margen de tolerancia de zona de una empresa. */
export async function setAssistGeoTolerance(businessUnitId: number, meters: number): Promise<void> {
  await db
    .from('system_settings')
    .where('business_unit_id', businessUnitId)
    .update({ system_setting_zone_tolerance_meters: meters })
}

/**
 * Retira las asignaciones del empleado y las zonas creadas por la prueba.
 *
 * @param employeeId - Empleado de la prueba.
 * @param zoneIds - Zonas creadas con `createAssistGeoZone`.
 */
export async function cleanupAssistGeo(employeeId: number, zoneIds: number[]): Promise<void> {
  await db.from('employee_zones').where('employee_id', employeeId).delete()
  if (zoneIds.length > 0) {
    await db.from('employee_zones').whereIn('zone_id', zoneIds).delete()
    await db.from('zones').whereIn('zone_id', zoneIds).delete()
  }
}
