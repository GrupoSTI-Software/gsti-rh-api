import { test } from '@japa/runner'
import { parseZoneGeometries } from '#utils/zone_geometry_parser'
import { ASSIST_GEO_ZONES } from '#tests/helpers/assist_geo_fixtures'

/** VLRH-H1790812613754 — lectura defensiva de `zones.zone_polygon`. */
test.group('parseZoneGeometries', () => {
  test('Polygon da un anillo y quita el vértice de cierre repetido', ({ assert }) => {
    const geometries = parseZoneGeometries(ASSIST_GEO_ZONES.Z1_POLYGON)
    assert.lengthOf(geometries, 1)
    assert.equal(geometries[0].kind, 'ring')
    if (geometries[0].kind === 'ring') {
      assert.lengthOf(geometries[0].ring, 4)
      // GeoJSON es [lng, lat]: la conversión ocurre aquí.
      assert.deepEqual(geometries[0].ring[0], { lat: 20.673, lng: -103.355 })
    }
  })

  test('LineString abierta da un anillo', ({ assert }) => {
    const geometries = parseZoneGeometries(ASSIST_GEO_ZONES.Z1_OPEN_LINESTRING)
    assert.lengthOf(geometries, 1)
    assert.equal(geometries[0].kind, 'ring')
  })

  test('Point da un centro', ({ assert }) => {
    assert.deepEqual(parseZoneGeometries(ASSIST_GEO_ZONES.Z_POINT), [
      { kind: 'point', center: { lat: 20.674, lng: -103.354 } },
    ])
  })

  test('recorre todas las figuras, no solo features[0]', ({ assert }) => {
    const geometries = parseZoneGeometries(ASSIST_GEO_ZONES.Z_MIXED)
    assert.deepEqual(
      geometries.map((geometry) => geometry.kind),
      ['point', 'ring']
    )
  })

  test('MultiPolygon da un anillo por polígono', ({ assert }) => {
    const square = [
      [-103.355, 20.673],
      [-103.353, 20.673],
      [-103.353, 20.675],
      [-103.355, 20.673],
    ]
    const raw = JSON.stringify({ type: 'MultiPolygon', coordinates: [[square], [square]] })
    assert.lengthOf(parseZoneGeometries(raw), 2)
  })

  test('acepta Feature y geometría suelta', ({ assert }) => {
    const geometry = { type: 'Point', coordinates: [-103.354, 20.674] }
    assert.lengthOf(parseZoneGeometries(JSON.stringify({ type: 'Feature', geometry })), 1)
    assert.lengthOf(parseZoneGeometries(JSON.stringify(geometry)), 1)
  })

  test('nunca lanza: JSON roto, vacío o figuras inválidas dan []', ({ assert }) => {
    assert.deepEqual(parseZoneGeometries(ASSIST_GEO_ZONES.Z_CORRUPT), [])
    assert.deepEqual(parseZoneGeometries(ASSIST_GEO_ZONES.Z_EMPTY), [])
    assert.deepEqual(parseZoneGeometries(''), [])
    assert.deepEqual(parseZoneGeometries('null'), [])
    assert.deepEqual(parseZoneGeometries('[1,2]'), [])
    const invalid = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        null,
        { type: 'Feature', geometry: null },
        { type: 'Feature', geometry: { type: 'Point', coordinates: ['a', 'b'] } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-200, 20] } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-103.35, 20.67], [-103.36, 20.68]] } },
        { type: 'Feature', geometry: { type: 'Circle', coordinates: [] } },
      ],
    })
    assert.deepEqual(parseZoneGeometries(invalid), [])
  })
})
