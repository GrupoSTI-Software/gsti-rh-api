import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { AssistGeoGuard } from '#modules/assist-ingestion/geo/assist_geo_guard'
import { AssistZoneContextLoader } from '#modules/assist-ingestion/geo/assist_zone_context.loader'
import type { AssistZoneContextCache } from '#modules/assist-ingestion/geo/assist_zone_context.loader'
import type { AssistZoneContext } from '#modules/assist-ingestion/geo/assist_zone_decision'
import type { AssistIngestionRecord } from '#modules/assist-ingestion/dto/assist_ingestion.dto'
import { ASSIST_ERROR_CODES } from '#constants/assist_error_codes'
import { ASSIST_ORIGIN } from '#constants/assist_origin'
import { SYSTEM_SETTING_ZONE_TOLERANCE_METERS_DEFAULT } from '#constants/system_setting_defaults'
import type SystemSettingService from '#services/system_setting_service'
import type SystemSetting from '#models/system_setting'
import { parseZoneGeometries } from '#utils/zone_geometry_parser'
import type { GeoPoint } from '#utils/geo_polygon'
import { ASSIST_GEO_POINTS, ASSIST_GEO_ZONES } from '#tests/helpers/assist_geo_fixtures'

/**
 * VLRH-H1790812613754 — orden de los pasos del guard, exención sin consultas y
 * entrada manipulada. El cargador es un doble: aquí no se toca la base.
 */

class FakeLoader extends AssistZoneContextLoader {
  calls = 0

  constructor(private readonly context: AssistZoneContext) {
    super()
  }

  async load(): Promise<AssistZoneContext> {
    this.calls++
    return this.context
  }
}

const Z1_CONTEXT: AssistZoneContext = {
  assignmentCount: 1,
  geometries: parseZoneGeometries(ASSIST_GEO_ZONES.Z1_POLYGON),
  toleranceMeters: 50,
}

function recordAt(
  point: Partial<GeoPoint> | null,
  precision: number | null = null
): AssistIngestionRecord {
  return {
    index: 0,
    businessUnitId: 1,
    employeeId: 1,
    employeeCode: 'E-1',
    assistType: 'check',
    punchTimeUtc: DateTime.utc(),
    geo: {
      latitude: point?.lat ?? null,
      longitude: point?.lng ?? null,
      precision,
    },
    origin: ASSIST_ORIGIN.SELF_SERVICE,
    createdByUserId: 1,
    terminalSn: null,
  }
}

const NO_ANY_ZONE = { authorizeAnyZones: false }

function guardWith(context: AssistZoneContext = Z1_CONTEXT) {
  const loader = new FakeLoader(context)
  const guard = new AssistGeoGuard(loader)
  return { guard, loader, cache: guard.createCache() }
}

test.group('AssistGeoGuard', () => {
  test('CA-06: sin latitud ni longitud queda exenta y no consulta zonas', async ({ assert }) => {
    const { guard, loader, cache } = guardWith()
    assert.isNull(await guard.check(recordAt(null, 30), NO_ANY_ZONE, cache))
    assert.equal(loader.calls, 0)
  })

  test('CA-01: dentro de la zona se acepta', async ({ assert }) => {
    const { guard, cache } = guardWith()
    assert.isNull(await guard.check(recordAt(ASSIST_GEO_POINTS.CENTER), NO_ANY_ZONE, cache))
  })

  test('CA-02: fuera de la zona se rechaza con AST.GEO.001', async ({ assert }) => {
    const { guard, cache } = guardWith()
    const rejection = await guard.check(recordAt(ASSIST_GEO_POINTS.HOME), NO_ANY_ZONE, cache)
    assert.equal(rejection?.code, ASSIST_ERROR_CODES.GEO_OUTSIDE_ZONE)
    assert.equal(rejection?.key, 'checada-fuera-de-zona')
    assert.equal(rejection?.status, 422)
  })

  test('CA-07: "cualquier zona" acepta fuera de zona sin consultar', async ({ assert }) => {
    const { guard, loader, cache } = guardWith({ assignmentCount: 0, geometries: [], toleranceMeters: 50 })
    assert.isNull(
      await guard.check(recordAt(ASSIST_GEO_POINTS.HOME), { authorizeAnyZones: true }, cache)
    )
    assert.equal(loader.calls, 0)
  })

  test('CA-08: coordenadas imposibles se rechazan antes que "cualquier zona"', async ({
    assert,
  }) => {
    const { guard, loader, cache } = guardWith()
    const anyZone = { authorizeAnyZones: true }
    for (const point of [
      { lat: 91, lng: -103.354 },
      { lat: 20.674, lng: -181 },
      { lat: 20.674 },
      { lng: -103.354 },
      { lat: Number.NaN, lng: -103.354 },
    ]) {
      const rejection = await guard.check(recordAt(point), anyZone, cache)
      assert.equal(rejection?.code, ASSIST_ERROR_CODES.VAL_COORDINATES_INVALID, JSON.stringify(point))
      assert.equal(rejection?.status, 400)
    }
    assert.equal(loader.calls, 0)
  })

  test('CA-09: sin asignaciones se rechaza con AST.GEO.002', async ({ assert }) => {
    const { guard, cache } = guardWith({ assignmentCount: 0, geometries: [], toleranceMeters: 50 })
    const rejection = await guard.check(recordAt(ASSIST_GEO_POINTS.CENTER), NO_ANY_ZONE, cache)
    assert.equal(rejection?.code, ASSIST_ERROR_CODES.GEO_NO_AUTHORIZED_ZONE)
  })

  test('CA-10: asignaciones sin figura evaluable se rechazan con AST.GEO.003', async ({
    assert,
  }) => {
    const { guard, cache } = guardWith({ assignmentCount: 1, geometries: [], toleranceMeters: 200 })
    const rejection = await guard.check(recordAt(ASSIST_GEO_POINTS.CENTER), NO_ANY_ZONE, cache)
    assert.equal(rejection?.code, ASSIST_ERROR_CODES.GEO_ZONE_NOT_EVALUABLE)
  })

  test('el rechazo no lleva coordenadas, distancia, zona ni margen', async ({ assert }) => {
    const { guard, cache } = guardWith()
    const rejection = await guard.check(recordAt(ASSIST_GEO_POINTS.HOME), NO_ANY_ZONE, cache)
    assert.deepEqual(Object.keys(rejection ?? {}).sort(), ['code', 'i18nBase', 'key', 'status'])
    const text = JSON.stringify(rejection)
    for (const fragment of ['20.68', '103.36', '761', 'zoneId', 'tolerance']) {
      assert.notInclude(text, fragment)
    }
  })
})

/** Respaldo del margen (CA-05): sin configuración de la empresa se aplican 50 m. */
test.group('AssistZoneContextLoader — margen de respaldo', () => {
  test('CA-05: si la configuración no se puede leer, el margen es el valor base', async ({
    assert,
  }) => {
    const failing = {
      resolveByBusinessUnitId: async (): Promise<SystemSetting> => {
        throw new Error('sin configuración')
      },
    } as unknown as SystemSettingService
    const loader = new AssistZoneContextLoader(failing)
    const cache: AssistZoneContextCache = loader.createCache()
    // Sin asignaciones reales: el margen se prueba aislado, sembrando la caché de zonas.
    cache.zonesByEmployee.set('999999:999999', { assignmentCount: 1, geometries: [] })

    const context = await loader.load(999_999, 999_999, cache)
    assert.equal(context.toleranceMeters, SYSTEM_SETTING_ZONE_TOLERANCE_METERS_DEFAULT)
    assert.equal(cache.toleranceByBusinessUnit.get(999_999), 50)
  })

  test('la caché de la entrega evita volver a leer el margen', async ({ assert }) => {
    let reads = 0
    const counting = {
      resolveByBusinessUnitId: async (): Promise<SystemSetting> => {
        reads++
        return { systemSettingZoneToleranceMeters: 80 } as SystemSetting
      },
    } as unknown as SystemSettingService
    const loader = new AssistZoneContextLoader(counting)
    const cache = loader.createCache()
    cache.zonesByEmployee.set('7:1', { assignmentCount: 1, geometries: [] })
    cache.zonesByEmployee.set('7:2', { assignmentCount: 1, geometries: [] })

    const first = await loader.load(1, 7, cache)
    const second = await loader.load(2, 7, cache)
    assert.equal(first.toleranceMeters, 80)
    assert.equal(second.toleranceMeters, 80)
    assert.equal(reads, 1)
  })
})
