/**
 * Geometría pura sobre coordenadas geográficas (VLRH-H1790812613754).
 *
 * Sin dependencias ni efectos: la usa la comprobación de zona de la ingesta de
 * checadas y la reutiliza la lectura de zonas del expediente
 * (VLRH-H1791056339679). Las distancias son en metros sobre una esfera de radio
 * medio; a la escala de una zona de asistencia (cientos de metros) el error
 * frente al elipsoide es de centímetros.
 */

/** Punto geográfico en grados decimales. */
export interface GeoPoint {
  lat: number
  lng: number
}

/** Radio medio de la Tierra en metros. */
export const EARTH_RADIUS_METERS = 6_371_000

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

/** Distancia de gran círculo entre dos puntos, en metros. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Indica si el punto cae dentro del anillo (ray casting).
 *
 * El anillo puede venir cerrado (último vértice igual al primero) o abierto: el
 * lado de cierre se considera igual. Un punto exactamente sobre el borde puede
 * caer de cualquier lado; quien decide usa además la distancia al borde.
 */
export function isPointInRing(point: GeoPoint, ring: readonly GeoPoint[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    const crosses =
      a.lat > point.lat !== b.lat > point.lat &&
      point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng
    if (crosses) inside = !inside
  }
  return inside
}

/**
 * Distancia del punto al segmento AB, en metros.
 *
 * Proyecta en un plano equirectangular local centrado en el punto, acota la
 * proyección al segmento y mide con haversine hasta el punto proyectado.
 */
export function distanceToSegmentMeters(point: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  const cosLat = Math.cos(toRadians(point.lat))
  const ax = (a.lng - point.lng) * cosLat
  const ay = a.lat - point.lat
  const bx = (b.lng - point.lng) * cosLat
  const by = b.lat - point.lat
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSquared))
  const projected: GeoPoint = {
    lat: a.lat + t * (b.lat - a.lat),
    lng: a.lng + t * (b.lng - a.lng),
  }
  return haversineMeters(point, projected)
}

/** Distancia mínima del punto a los lados del anillo, en metros (incluye el lado de cierre). */
export function distanceToRingMeters(point: GeoPoint, ring: readonly GeoPoint[]): number {
  let minimum = Number.POSITIVE_INFINITY
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    minimum = Math.min(minimum, distanceToSegmentMeters(point, a, b))
  }
  return minimum
}
