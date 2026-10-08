import { test } from '@japa/runner'
import { resolveAssistLocationFlag } from '#modules/assist-ingestion/geo/assist_location_flag'
import type { AssistIngestionGeo } from '#modules/assist-ingestion/dto/assist_ingestion.dto'
import type { AssistLocationFlag } from '#constants/assist_location_flag'

/** VLRH-H1790812613756 — tabla de verdad completa de la marca (16 combinaciones). */

const COORDINATES: { label: string; latitude: number | null; longitude: number | null }[] = [
  { label: 'ambas nulas', latitude: null, longitude: null },
  { label: 'solo lat', latitude: 20.674, longitude: null },
  { label: 'solo lng', latitude: null, longitude: -103.354 },
  { label: 'ambas presentes', latitude: 20.674, longitude: -103.354 },
]

const INDICATORS: { label: string; geo: Pick<AssistIngestionGeo, 'isMocked'> }[] = [
  { label: 'true', geo: { isMocked: true } },
  { label: 'false', geo: { isMocked: false } },
  { label: 'null', geo: { isMocked: null } },
  { label: 'ausente', geo: {} },
]

/** Esperado por fila de coordenadas, en el orden de `INDICATORS`. */
const EXPECTED: Record<string, (AssistLocationFlag | null)[]> = {
  'ambas nulas': [null, null, null, null],
  'solo lat': [null, null, null, null],
  'solo lng': [null, null, null, null],
  'ambas presentes': ['simulated', null, 'unverified', 'unverified'],
}

test.group('resolveAssistLocationFlag', () => {
  test('tabla de verdad: {case}')
    .with(
      COORDINATES.flatMap((coordinates) =>
        INDICATORS.map((indicator, column) => ({
          case: `${coordinates.label} + ${indicator.label}`,
          coordinates,
          indicator,
          expected: EXPECTED[coordinates.label][column],
        }))
      )
    )
    .run(({ assert }, { case: label, coordinates, indicator, expected }) => {
      const geo: AssistIngestionGeo = {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        precision: 10,
        ...indicator.geo,
      }
      assert.strictEqual(
        resolveAssistLocationFlag(geo),
        expected,
        label
      )
    })

  test('el indicador ausente no se lee como "no simulada"', ({ assert }) => {
    const geo: AssistIngestionGeo = { latitude: 20.674, longitude: -103.354, precision: null }
    assert.isFalse(Object.hasOwn(geo, 'isMocked'))
    assert.strictEqual(resolveAssistLocationFlag(geo), 'unverified')
  })
})
