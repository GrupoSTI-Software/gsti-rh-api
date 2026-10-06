import type { GeoPoint } from '#utils/geo_polygon'

/**
 * Lectura defensiva de `zones.zone_polygon` (VLRH-H1790812613754).
 *
 * El editor del backoffice guarda una `FeatureCollection` con varias figuras:
 * polígonos de anillo cerrado, polilíneas (las zonas históricas) y marcadores
 * sueltos. La validación de la PWA retirada leía solo `features[0]` y fallaba con
 * polígonos anidados; aquí se recorren todas las figuras y se tolera cualquier
 * forma rota sin lanzar: una zona que no se puede leer no aporta geometría y
 * quien decide la trata como no evaluable.
 *
 * GeoJSON ordena las posiciones como `[longitud, latitud]`; la conversión a
 * `GeoPoint` ocurre una sola vez, aquí.
 */

/** Figura de una zona ya interpretada. */
export type ZoneGeometry =
  | { kind: 'ring'; ring: GeoPoint[] }
  | { kind: 'point'; center: GeoPoint }

/** Vértices distintos mínimos para que un anillo encierre un área. */
const MIN_RING_VERTICES = 3

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Convierte una posición `[lng, lat]` en punto; `null` si no es finita o no es geográfica. */
function toPoint(position: unknown): GeoPoint | null {
  if (!Array.isArray(position) || position.length < 2) return null
  const [lng, lat] = position as unknown[]
  if (typeof lng !== 'number' || typeof lat !== 'number') return null
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

/** Anillo con al menos tres vértices distintos; quita el vértice de cierre repetido. */
function toRing(positions: unknown): GeoPoint[] | null {
  if (!Array.isArray(positions)) return null
  const points: GeoPoint[] = []
  for (const position of positions) {
    const point = toPoint(position)
    if (!point) return null
    points.push(point)
  }
  const first = points[0]
  const last = points[points.length - 1]
  if (points.length > 1 && first.lat === last.lat && first.lng === last.lng) {
    points.pop()
  }
  return points.length >= MIN_RING_VERTICES ? points : null
}

/** Figuras de una geometría GeoJSON suelta; desconocidas o rotas no aportan nada. */
function fromGeometry(geometry: unknown): ZoneGeometry[] {
  if (!isRecord(geometry)) return []
  const { type, coordinates } = geometry

  switch (type) {
    case 'Point': {
      const center = toPoint(coordinates)
      return center ? [{ kind: 'point', center }] : []
    }
    case 'LineString': {
      // Polilínea histórica: se cierra uniendo el último vértice con el primero.
      const ring = toRing(coordinates)
      return ring ? [{ kind: 'ring', ring }] : []
    }
    case 'Polygon':
      return ringsOf(coordinates)
    case 'MultiPolygon':
      return Array.isArray(coordinates) ? coordinates.flatMap((polygon) => ringsOf(polygon)) : []
    default:
      return []
  }
}

/**
 * Un anillo por cada anillo del polígono. Los huecos cuentan como área: el editor
 * no los produce y tratarlos como exclusión rechazaría checadas por un dato que
 * nadie dibujó a propósito.
 */
function ringsOf(polygon: unknown): ZoneGeometry[] {
  if (!Array.isArray(polygon)) return []
  const geometries: ZoneGeometry[] = []
  for (const positions of polygon) {
    const ring = toRing(positions)
    if (ring) geometries.push({ kind: 'ring', ring })
  }
  return geometries
}

/**
 * Figuras evaluables de una zona.
 *
 * Acepta `FeatureCollection`, `Feature` o una geometría suelta. Nunca lanza:
 * JSON roto, tipos desconocidos o coordenadas inválidas devuelven `[]` o se
 * descartan figura por figura.
 *
 * @param raw - Contenido crudo de `zones.zone_polygon`.
 */
export function parseZoneGeometries(raw: string): ZoneGeometry[] {
  let document: unknown
  try {
    document = JSON.parse(raw)
  } catch {
    return []
  }
  if (!isRecord(document)) return []

  if (document.type === 'FeatureCollection') {
    if (!Array.isArray(document.features)) return []
    return document.features.flatMap((feature) => {
      try {
        return isRecord(feature) ? fromGeometry(feature.geometry) : []
      } catch {
        return []
      }
    })
  }

  if (document.type === 'Feature') return fromGeometry(document.geometry)

  return fromGeometry(document)
}
