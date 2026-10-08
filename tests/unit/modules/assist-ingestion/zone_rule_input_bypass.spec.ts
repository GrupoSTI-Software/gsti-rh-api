import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { AssistGeoGuard } from '#modules/assist-ingestion/geo/assist_geo_guard'
import { AssistZoneContextLoader } from '#modules/assist-ingestion/geo/assist_zone_context.loader'
import type { AssistZoneContext } from '#modules/assist-ingestion/geo/assist_zone_decision'
import type { AssistIngestionRecord } from '#modules/assist-ingestion/dto/assist_ingestion.dto'
import { ASSIST_ERROR_CODES } from '#constants/assist_error_codes'
import { ASSIST_ORIGIN } from '#constants/assist_origin'
import { parseZoneGeometries } from '#utils/zone_geometry_parser'
import { ASSIST_GEO_POINTS, ASSIST_GEO_ZONES } from '#tests/helpers/assist_geo_fixtures'

/**
 * VLRH-H1790812613754, SEC-754-3 y SEC-754-4 — lo que un cliente modificado puede
 * mandar para saltarse la zona: coordenadas a medias, precisión inflada o
 * negativa, precisión sin coordenadas u otro origen declarado.
 */

class StaticLoader extends AssistZoneContextLoader {
  async load(): Promise<AssistZoneContext> {
    return {
      assignmentCount: 1,
      geometries: parseZoneGeometries(ASSIST_GEO_ZONES.Z1_POLYGON),
      toleranceMeters: 50,
    }
  }
}

const guard = new AssistGeoGuard(new StaticLoader())
const NO_ANY_ZONE = { authorizeAnyZones: false }

function record(
  latitude: number | null,
  longitude: number | null,
  precision: number | null,
  origin: AssistIngestionRecord['origin'] = ASSIST_ORIGIN.SELF_SERVICE
): AssistIngestionRecord {
  return {
    index: 0,
    businessUnitId: 1,
    employeeId: 1,
    employeeCode: 'E-1',
    assistType: 'check',
    punchTimeUtc: DateTime.utc(),
    geo: { latitude, longitude, precision },
    origin,
    createdByUserId: 1,
    terminalSn: null,
  }
}

test.group('Comprobación de zona — entrada manipulada', () => {
  test('una sola coordenada no se trata como checada sin ubicación', async ({ assert }) => {
    const onlyLatitude = await guard.check(record(20.674, null, null), NO_ANY_ZONE, guard.createCache())
    const onlyLongitude = await guard.check(record(null, -103.354, null), NO_ANY_ZONE, guard.createCache())
    assert.equal(onlyLatitude?.code, ASSIST_ERROR_CODES.VAL_COORDINATES_INVALID)
    assert.equal(onlyLongitude?.code, ASSIST_ERROR_CODES.VAL_COORDINATES_INVALID)
  })

  test('una precisión enorme no ensancha la zona más allá del tope', async ({ assert }) => {
    const { NORTH_120 } = ASSIST_GEO_POINTS
    const rejection = await guard.check(
      record(NORTH_120.lat, NORTH_120.lng, 1_000_000),
      NO_ANY_ZONE,
      guard.createCache()
    )
    assert.equal(rejection?.code, ASSIST_ERROR_CODES.GEO_OUTSIDE_ZONE)
  })

  test('una precisión negativa no resta holgura', async ({ assert }) => {
    const { NORTH_45 } = ASSIST_GEO_POINTS
    assert.isNull(
      await guard.check(record(NORTH_45.lat, NORTH_45.lng, -500), NO_ANY_ZONE, guard.createCache())
    )
  })

  test('la precisión sola, sin coordenadas, deja la checada exenta', async ({ assert }) => {
    assert.isNull(await guard.check(record(null, null, 5), NO_ANY_ZONE, guard.createCache()))
  })

  test('el origen declarado no exime: dispositivo o captura fuera de zona se rechazan igual', async ({
    assert,
  }) => {
    const { HOME } = ASSIST_GEO_POINTS
    for (const origin of [ASSIST_ORIGIN.DEVICE, ASSIST_ORIGIN.ADMIN_CAPTURE, ASSIST_ORIGIN.MANUAL]) {
      const rejection = await guard.check(record(HOME.lat, HOME.lng, null, origin), NO_ANY_ZONE, guard.createCache())
      assert.equal(rejection?.code, ASSIST_ERROR_CODES.GEO_OUTSIDE_ZONE, origin)
    }
  })
})
