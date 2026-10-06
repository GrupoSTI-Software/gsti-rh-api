import { test } from '@japa/runner'
import {
  distanceToRingMeters,
  distanceToSegmentMeters,
  haversineMeters,
  isPointInRing,
} from '#utils/geo_polygon'
import type { GeoPoint } from '#utils/geo_polygon'
import { parseZoneGeometries } from '#utils/zone_geometry_parser'
import { ASSIST_GEO_POINTS, ASSIST_GEO_ZONES } from '#tests/helpers/assist_geo_fixtures'

/** VLRH-H1790812613754 — geometría pura contra las distancias del anexo A.2. */

const TOLERANCE_METERS = 0.5

function ringOf(polygon: string): GeoPoint[] {
  const [geometry] = parseZoneGeometries(polygon)
  if (geometry?.kind !== 'ring') throw new Error('la fixture debía dar un anillo')
  return geometry.ring
}

test.group('geo_polygon', () => {
  test('el centro de Z1 cae dentro y a 104.03 m del borde', ({ assert }) => {
    const z1 = ringOf(ASSIST_GEO_ZONES.Z1_POLYGON)
    const { CENTER } = ASSIST_GEO_POINTS
    assert.isTrue(isPointInRing(CENTER, z1))
    assert.closeTo(distanceToRingMeters(CENTER, z1), CENTER.expectedMeters, TOLERANCE_METERS)
  })

  test('los puntos al norte quedan fuera con la distancia del anexo', ({ assert }) => {
    const z1 = ringOf(ASSIST_GEO_ZONES.Z1_POLYGON)
    for (const name of ['NORTH_30', 'NORTH_45', 'NORTH_80', 'NORTH_120', 'HOME'] as const) {
      const point = ASSIST_GEO_POINTS[name]
      assert.isFalse(isPointInRing(point, z1), `${name} debe quedar fuera`)
      assert.closeTo(distanceToRingMeters(point, z1), point.expectedMeters, TOLERANCE_METERS, name)
    }
  })

  test('la polilínea abierta se cierra: el lado de cierre cuenta', ({ assert }) => {
    const open = ringOf(ASSIST_GEO_ZONES.Z1_OPEN_LINESTRING)
    const { WEST_IN, WEST_30 } = ASSIST_GEO_POINTS
    assert.isTrue(isPointInRing(WEST_IN, open))
    assert.closeTo(distanceToRingMeters(WEST_IN, open), WEST_IN.expectedMeters, TOLERANCE_METERS)
    assert.isFalse(isPointInRing(WEST_30, open))
    assert.closeTo(distanceToRingMeters(WEST_30, open), WEST_30.expectedMeters, TOLERANCE_METERS)
  })

  test('haversine al marcador suelto', ({ assert }) => {
    const center = { lat: 20.674, lng: -103.354 }
    const { POINT_40, POINT_60 } = ASSIST_GEO_POINTS
    assert.closeTo(haversineMeters(POINT_40, center), POINT_40.expectedMeters, TOLERANCE_METERS)
    assert.closeTo(haversineMeters(POINT_60, center), POINT_60.expectedMeters, TOLERANCE_METERS)
  })

  test('un segmento degenerado mide al vértice', ({ assert }) => {
    const vertex = { lat: 20.674, lng: -103.354 }
    const { POINT_40 } = ASSIST_GEO_POINTS
    assert.closeTo(
      distanceToSegmentMeters(POINT_40, vertex, vertex),
      POINT_40.expectedMeters,
      TOLERANCE_METERS
    )
  })
})
