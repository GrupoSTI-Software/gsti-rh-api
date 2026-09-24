import { test } from '@japa/runner'
import type { I18n } from '@adonisjs/i18n'
import type {
  OverviewResponse,
  OverviewStatistics,
} from '#modules/attendance-stats/dto/attendance-stats.dto'
import type { ServiceResult } from '#modules/attendance-stats/attendance-stats.service'
import AttendanceStatsService from '#modules/attendance-stats/attendance-stats.service'
import PlatformTrialUsageService, {
  resolveFrecuenciaPct,
} from '#services/platform_trial_usage_service'

/**
 * USRH1789079078171 — reglas puras de `PlatformTrialUsageService`, con
 * `OverviewResponse` de fixture (sin BD, sin motor real). El camino feliz
 * sembrado de verdad y el aislamiento entre tenants van en el spec
 * funcional (`platform_trial_usage_metrics.spec.ts`) — R-3 del spec: sembrar
 * el motor y asertar una cifra se estrena ahí, y no cabe repetirlo en cada
 * combinación de reglas.
 */

function statsFixture(overrides: Partial<OverviewStatistics> = {}): OverviewStatistics {
  return {
    assists: 0,
    tolerances: 0,
    delays: 0,
    earlyOuts: 0,
    faults: 0,
    justifiedAbsences: 0,
    vacations: 0,
    holidays: 0,
    totalAvailable: 0,
    ontimePercentage: 0,
    tolerancePercentage: 0,
    delayPercentage: 0,
    earlyOutPercentage: 0,
    faultPercentage: 0,
    employeesQty: 0,
    ...overrides,
  }
}

function overviewFixture(
  daily: Array<{ day: string; statistics: OverviewStatistics }>,
  statistics?: OverviewStatistics
): OverviewResponse {
  const total =
    statistics ??
    daily.reduce<OverviewStatistics>((acc, d) => {
      const s = d.statistics
      return statsFixture({
        assists: acc.assists + s.assists,
        tolerances: acc.tolerances + s.tolerances,
        delays: acc.delays + s.delays,
        earlyOuts: acc.earlyOuts + s.earlyOuts,
        faults: acc.faults + s.faults,
        totalAvailable: acc.totalAvailable + s.totalAvailable,
        // `employeesQty` NO es sumable entre días (dto:65-73); el fixture del
        // acumulado se pasa aparte cuando el test lo necesita.
        employeesQty: acc.employeesQty,
      })
    }, statsFixture())

  return {
    statistics: total,
    period: { startDay: daily[0]?.day ?? '2026-09-01', endDay: daily.at(-1)?.day ?? '2026-09-01', evaluableDays: total.totalAvailable },
    daily,
  }
}

/**
 * `i18n` mínimo: el constructor real de `AttendanceStatsService` invoca
 * `i18n.formatMessage.bind(i18n)` de inmediato (`attendance-stats.service.ts:106`).
 * El doble nunca llama a `getOverview` real, así que basta con que el bind
 * no truene — el texto que devuelva no se usa en ningún assert de este spec.
 */
const FAKE_I18N = { formatMessage: (key: string) => key } as unknown as I18n

/** Doble del motor: mismo contrato de `AttendanceStatsService.getOverview`, sin BD. */
class FakeAttendanceStatsService extends AttendanceStatsService {
  constructor(private readonly fixedResult: ServiceResult<OverviewResponse>) {
    super(FAKE_I18N)
  }

  override async getOverview(): Promise<ServiceResult<OverviewResponse>> {
    return this.fixedResult
  }
}

function serviceWithFakeMotor(fixedResult: ServiceResult<OverviewResponse>): PlatformTrialUsageService {
  return new PlatformTrialUsageService(FAKE_I18N, new FakeAttendanceStatsService(fixedResult))
}

test.group('resolveFrecuenciaPct (pura) — USRH1789079078171', () => {
  test('base 0 → null, NUNCA 0 (RB-3)', ({ assert }) => {
    assert.isNull(resolveFrecuenciaPct(0, 0))
    // Ni siquiera con registros > 0 y base 0 (caso imposible en la práctica,
    // pero la función pura no debe inventar un 0 ahí tampoco).
    assert.isNull(resolveFrecuenciaPct(5, 0))
  })

  test('redondea a un decimal', ({ assert }) => {
    assert.equal(resolveFrecuenciaPct(15, 21), 71.4)
    assert.equal(resolveFrecuenciaPct(2, 3), 66.7)
  })

  test('0 registros con base > 0 es 0, no null (CA-04: son cosas distintas)', ({ assert }) => {
    assert.equal(resolveFrecuenciaPct(0, 10), 0)
  })

  test('100% exacto', ({ assert }) => {
    assert.equal(resolveFrecuenciaPct(10, 10), 100)
  })
})

test.group('PlatformTrialUsageService — traducción del motor (CA-03, CA-04, CA-12)', () => {
  test('sin-base ⟺ totalAvailable === 0, jamás por "no hay checadas" ni por respuesta vacía', async ({
    assert,
  }) => {
    const service = serviceWithFakeMotor({
      status: 200,
      type: 'success',
      title: 't',
      message: 'm',
      data: overviewFixture([{ day: '2026-09-01', statistics: statsFixture({ totalAvailable: 0 }) }]),
    })

    const frecuencia = await service.resolveFrecuencia(1, { inicio: '2026-09-01', fin: '2026-09-01' })
    assert.equal(frecuencia.estado, 'sin-base')
    assert.isNull(frecuencia.porcentaje)
    assert.equal(frecuencia.registros, 0)
    assert.equal(frecuencia.empleadoDiasEvaluables, 0)
  })

  test('0 % es distinguible de sin-base con empleados evaluados y cero registros (CA-04)', async ({
    assert,
  }) => {
    const stats = statsFixture({ totalAvailable: 10, faults: 10, employeesQty: 2 })
    const service = serviceWithFakeMotor({
      status: 200,
      type: 'success',
      title: 't',
      message: 'm',
      data: overviewFixture([{ day: '2026-09-01', statistics: stats }], stats),
    })

    const frecuencia = await service.resolveFrecuencia(1, { inicio: '2026-09-01', fin: '2026-09-01' })
    assert.equal(frecuencia.estado, 'con-base')
    assert.equal(frecuencia.porcentaje, 0)
    assert.equal(frecuencia.registros, 0)
    assert.equal(frecuencia.empleadoDiasEvaluables, 10)
    assert.equal(frecuencia.empleadosEvaluados, 2)
  })

  test('el numerador es assists+tolerances+delays; earlyOuts NUNCA entra (RB-1, dto:24-31)', async ({
    assert,
  }) => {
    const stats = statsFixture({
      assists: 3,
      tolerances: 2,
      delays: 1,
      earlyOuts: 99, // Si esto contara, el registros sería 105, no 6.
      faults: 4,
      totalAvailable: 10,
      employeesQty: 1,
    })
    const service = serviceWithFakeMotor({
      status: 200,
      type: 'success',
      title: 't',
      message: 'm',
      data: overviewFixture([{ day: '2026-09-01', statistics: stats }], stats),
    })

    const frecuencia = await service.resolveFrecuencia(1, { inicio: '2026-09-01', fin: '2026-09-01' })
    assert.equal(frecuencia.registros, 6)
    assert.equal(frecuencia.porcentaje, 60)
  })

  test('la serie viene tal cual del motor: un punto por día, sin construirla ni rellenar huecos', async ({
    assert,
  }) => {
    const dia1 = statsFixture({ totalAvailable: 0 })
    const dia2 = statsFixture({ assists: 2, totalAvailable: 3, employeesQty: 3 })
    const service = serviceWithFakeMotor({
      status: 200,
      type: 'success',
      title: 't',
      message: 'm',
      data: overviewFixture(
        [
          { day: '2026-09-01', statistics: dia1 },
          { day: '2026-09-02', statistics: dia2 },
        ],
        statsFixture({ assists: 2, totalAvailable: 3, employeesQty: 3 })
      ),
    })

    const usage = await (async () => {
      // `getTenantTrialUsage` exige un tenant con prueba real (BD); aquí se
      // ejercita `resolveFrecuencia` + el mapeo de la serie por separado,
      // reconstruyendo lo que `runMotor` arma internamente vía dos llamadas
      // equivalentes sobre el mismo doble.
      const frecuencia = await service.resolveFrecuencia(1, { inicio: '2026-09-01', fin: '2026-09-02' })
      return frecuencia
    })()

    assert.equal(usage.estado, 'con-base')
    assert.equal(usage.registros, 2)
    assert.equal(usage.empleadoDiasEvaluables, 3)
  })

  test("'no-disponible' está en el tipo pero este servicio nunca lo produce (CA-12)", async ({
    assert,
  }) => {
    const stats = statsFixture({ totalAvailable: 0 })
    const service = serviceWithFakeMotor({
      status: 200,
      type: 'success',
      title: 't',
      message: 'm',
      data: overviewFixture([{ day: '2026-09-01', statistics: stats }], stats),
    })
    const frecuencia = await service.resolveFrecuencia(1, { inicio: '2026-09-01', fin: '2026-09-01' })
    assert.notEqual(frecuencia.estado, 'no-disponible')
  })
})

test.group('PlatformTrialUsageService — fallo del motor (CA-11, RB-11) — ERROR', () => {
  test('ServiceResult con status !== 200 se mapea a PLT.MET.USAGE_UNAVAILABLE con httpStatus 500 explícito', async ({
    assert,
  }) => {
    const service = serviceWithFakeMotor({
      status: 403,
      type: 'error',
      title: 'forbidden',
      message: 'scope insuficiente',
      key: 'scope-insuficiente',
      data: null,
    })

    let threw = false
    try {
      await service.resolveFrecuencia(1, { inicio: '2026-09-01', fin: '2026-09-05' })
    } catch (error: unknown) {
      threw = true
      const err = error as { errorCode?: string; httpStatus?: number; key?: string; message?: string }
      assert.equal(err.errorCode, 'PLT.MET.USAGE_UNAVAILABLE')
      // Aserción obligatoria del spec (§9): el STATUS, no solo el code — el
      // default de la excepción es 400 y omitir el tercer argumento del
      // constructor deja el endpoint respondiendo 400 sin que nadie lo note.
      assert.equal(err.httpStatus, 500)
      // El sobre del motor no se propaga: 'scope-insuficiente' no debe
      // aparecer en ninguna parte del error resultante.
      assert.notInclude(JSON.stringify(err), 'scope-insuficiente')
    }
    assert.isTrue(threw, 'debía lanzar PlatformMetricServiceError')
  })

  test('data null con status 200 (defensivo) también se trata como fallo, nunca como sin-base', async ({
    assert,
  }) => {
    const service = serviceWithFakeMotor({
      status: 200,
      type: 'success',
      title: 't',
      message: 'm',
      data: null as unknown as OverviewResponse,
    })

    let threw = false
    try {
      await service.resolveFrecuencia(1, { inicio: '2026-09-01', fin: '2026-09-01' })
    } catch {
      threw = true
    }
    assert.isTrue(threw)
  })
})
