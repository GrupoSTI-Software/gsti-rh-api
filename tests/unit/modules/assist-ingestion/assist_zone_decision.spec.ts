import { test } from '@japa/runner'
import { decideZone } from '#modules/assist-ingestion/geo/assist_zone_decision'
import type { AssistZoneContext } from '#modules/assist-ingestion/geo/assist_zone_decision'
import { parseZoneGeometries } from '#utils/zone_geometry_parser'
import { ASSIST_GEO_POINTS, ASSIST_GEO_ZONES } from '#tests/helpers/assist_geo_fixtures'

/** VLRH-H1790812613754 — tabla de holgura del anexo A.2 y orden de los veredictos. */

function contextOf(polygon: string, toleranceMeters: number): AssistZoneContext {
  return { assignmentCount: 1, geometries: parseZoneGeometries(polygon), toleranceMeters }
}

const { Z1_POLYGON, Z_POINT } = ASSIST_GEO_ZONES

const TABLE: {
  point: keyof typeof ASSIST_GEO_POINTS
  polygon: string
  margin: number
  precision: number | null
  expected: 'inside' | 'outside'
}[] = [
  { point: 'NORTH_30', polygon: Z1_POLYGON, margin: 50, precision: 5, expected: 'inside' },
  { point: 'NORTH_45', polygon: Z1_POLYGON, margin: 50, precision: null, expected: 'inside' },
  { point: 'NORTH_45', polygon: Z1_POLYGON, margin: 50, precision: -500, expected: 'inside' },
  { point: 'NORTH_80', polygon: Z1_POLYGON, margin: 50, precision: null, expected: 'outside' },
  { point: 'NORTH_80', polygon: Z1_POLYGON, margin: 50, precision: 70, expected: 'outside' },
  { point: 'NORTH_80', polygon: Z1_POLYGON, margin: 50, precision: 90, expected: 'inside' },
  { point: 'NORTH_80', polygon: Z1_POLYGON, margin: 50, precision: 400, expected: 'inside' },
  { point: 'NORTH_80', polygon: Z1_POLYGON, margin: 100, precision: null, expected: 'inside' },
  { point: 'NORTH_30', polygon: Z1_POLYGON, margin: 0, precision: 90, expected: 'outside' },
  { point: 'NORTH_120', polygon: Z1_POLYGON, margin: 50, precision: 400, expected: 'outside' },
  { point: 'POINT_40', polygon: Z_POINT, margin: 50, precision: null, expected: 'inside' },
  { point: 'POINT_60', polygon: Z_POINT, margin: 50, precision: null, expected: 'outside' },
  { point: 'CENTER', polygon: Z1_POLYGON, margin: 0, precision: null, expected: 'inside' },
]

test.group('decideZone', () => {
  test('tabla de holgura del anexo A.2', ({ assert }) => {
    for (const row of TABLE) {
      const decision = decideZone(
        ASSIST_GEO_POINTS[row.point],
        row.precision,
        contextOf(row.polygon, row.margin)
      )
      assert.equal(
        decision,
        row.expected,
        `${row.point} margen ${row.margin} precisión ${row.precision}`
      )
    }
  })

  test('precisión no finita no aporta holgura', ({ assert }) => {
    const context = contextOf(Z1_POLYGON, 50)
    assert.equal(decideZone(ASSIST_GEO_POINTS.NORTH_80, Number.NaN, context), 'outside')
    assert.equal(
      decideZone(ASSIST_GEO_POINTS.NORTH_80, Number.POSITIVE_INFINITY, context),
      'outside'
    )
  })

  test('sin asignaciones es no-zones aunque haya figuras', ({ assert }) => {
    const context = { ...contextOf(Z1_POLYGON, 50), assignmentCount: 0 }
    assert.equal(decideZone(ASSIST_GEO_POINTS.CENTER, null, context), 'no-zones')
  })

  test('con asignaciones y sin figuras es not-evaluable, nunca inside', ({ assert }) => {
    const context: AssistZoneContext = { assignmentCount: 2, geometries: [], toleranceMeters: 200 }
    assert.equal(decideZone(ASSIST_GEO_POINTS.CENTER, null, context), 'not-evaluable')
  })

  test('basta con una figura: Z_MIXED acepta el centro aunque la primera esté lejos', ({
    assert,
  }) => {
    assert.equal(
      decideZone(ASSIST_GEO_POINTS.CENTER, null, contextOf(ASSIST_GEO_ZONES.Z_MIXED, 50)),
      'inside'
    )
  })
})
