import { test } from '@japa/runner'
import type { I18n } from '@adonisjs/i18n'
import PlatformLiveTrialService, {
  comparePlatformLiveTrialRows,
  type PlatformLiveTrialRow,
} from '#services/platform_live_trial_service'
import type { PlatformLiveTrialRef } from '#services/platform_trial_service'
import type PlatformTrialService from '#services/platform_trial_service'
import type PlatformTenantMilestoneService from '#services/platform_tenant_milestone_service'
import type { TenantMilestone } from '#services/platform_tenant_milestone_service'
import PlatformTrialUsageService, { type FrecuenciaEstado } from '#services/platform_trial_usage_service'
import AttendanceStatsService from '../../../app/modules/attendance-stats/attendance-stats.service.js'
import type {
  AttendanceStatsFilters,
  OverviewResponse,
  OverviewStatistics,
  ResolvedScope,
} from '../../../app/modules/attendance-stats/dto/attendance-stats.dto.js'
import type { ServiceResult } from '../../../app/modules/attendance-stats/attendance-stats.service.js'

/**
 * USRH1789079078173 — spec unitaria del comparador y del orquestador, sin
 * BD (molde §13 del spec técnico). El comparador es **puro** (RN-36/RN-37/
 * RN-54); el orquestador se prueba con dobles en las tres dependencias
 * (RN-49/F20: atribución por `businessUnitId`, RN-53: degradado por fila,
 * regla local "fallo global ≠ fallo de fila": propagación del universo/
 * hitos, y CA-12: una corrida del motor por prueba, nunca en lote).
 *
 * La siembra real, con tres tenants y el fallo provocado del motor, va en
 * `tests/functional/platform_live_trials_metrics.spec.ts`.
 */

function fakeI18n(): I18n {
  return {} as unknown as I18n
}

function row(overrides: Partial<PlatformLiveTrialRow> = {}): PlatformLiveTrialRow {
  return {
    tenant: { publicId: 'pub-a', nombre: 'Empresa A' },
    fin: '2026-10-01',
    diasRestantes: 5,
    hitosCumplidos: 0,
    hitosTotales: 7,
    frecuencia: { estado: 'con-base', porcentaje: 50 },
    ...overrides,
  }
}

function frecuencia(
  estado: FrecuenciaEstado,
  porcentaje: number | null
): PlatformLiveTrialRow['frecuencia'] {
  return { estado, porcentaje }
}

// ─── RN-36/RN-37/RN-54: orden puro ────────────────────────────────────────

test.group('comparePlatformLiveTrialRows (pura) — orden del listado (RN-36, RN-37, RN-54)', () => {
  test('sin-base siempre antes que con-base, sin importar porcentaje/diasRestantes', ({ assert }) => {
    const sinBase = row({ frecuencia: frecuencia('sin-base', null), diasRestantes: 20 })
    const conBase = row({ frecuencia: frecuencia('con-base', 5), diasRestantes: 1 })
    assert.isBelow(comparePlatformLiveTrialRows(sinBase, conBase), 0)
    assert.isAbove(comparePlatformLiveTrialRows(conBase, sinBase), 0)
  })

  test('no-disponible siempre al final, incluso con menos días restantes que las demás', ({ assert }) => {
    const noDisponible = row({ frecuencia: frecuencia('no-disponible', null), diasRestantes: 1 })
    const conBase = row({ frecuencia: frecuencia('con-base', 90), diasRestantes: 20 })
    assert.isAbove(comparePlatformLiveTrialRows(noDisponible, conBase), 0)
    assert.isBelow(comparePlatformLiveTrialRows(conBase, noDisponible), 0)
  })

  test('una empresa sin-base nunca queda debajo de una con 0 % — son grupos distintos, no números', ({
    assert,
  }) => {
    const sinBase = row({ frecuencia: frecuencia('sin-base', null), diasRestantes: 1 })
    const conBaseCero = row({ frecuencia: frecuencia('con-base', 0), diasRestantes: 99 })
    assert.isBelow(comparePlatformLiveTrialRows(sinBase, conBaseCero), 0)
  })

  test('dentro de con-base, ordena de menor a mayor porcentaje', ({ assert }) => {
    const bajo = row({ frecuencia: frecuencia('con-base', 10) })
    const alto = row({ frecuencia: frecuencia('con-base', 90) })
    assert.isBelow(comparePlatformLiveTrialRows(bajo, alto), 0)
    assert.isAbove(comparePlatformLiveTrialRows(alto, bajo), 0)
  })

  test('dentro del mismo grupo/porcentaje, ordena por diasRestantes ascendente', ({ assert }) => {
    const venceAntes = row({ frecuencia: frecuencia('con-base', 50), diasRestantes: 1 })
    const venceDespues = row({ frecuencia: frecuencia('con-base', 50), diasRestantes: 10 })
    assert.isBelow(comparePlatformLiveTrialRows(venceAntes, venceDespues), 0)
  })

  test('desempate final por publicId ascendente — comparador total, nunca 0 salvo la misma fila', ({
    assert,
  }) => {
    const a = row({ tenant: { publicId: 'aaa', nombre: 'A' } })
    const b = row({ tenant: { publicId: 'bbb', nombre: 'B' } })
    assert.isBelow(comparePlatformLiveTrialRows(a, b), 0)
    assert.isAbove(comparePlatformLiveTrialRows(b, a), 0)
    assert.equal(comparePlatformLiveTrialRows(a, a), 0)
  })

  test('RN-37: hitosCumplidos/hitosTotales NUNCA alteran el orden', ({ assert }) => {
    const pocosHitos = row({ tenant: { publicId: 'zzz', nombre: 'Pocos' }, hitosCumplidos: 0, hitosTotales: 7 })
    const muchosHitos = row({ tenant: { publicId: 'zzz', nombre: 'Pocos' }, hitosCumplidos: 7, hitosTotales: 7 })
    assert.equal(comparePlatformLiveTrialRows(pocosHitos, muchosHitos), 0)
  })

  test('CA-04 · orden extremo a extremo con los cinco casos declarados por el spec', ({ assert }) => {
    // sin-base(3d), sin-base(10d), con-base(5%), con-base(40%), no-disponible
    const filas: PlatformLiveTrialRow[] = [
      row({ tenant: { publicId: 'con40', nombre: 'C40' }, frecuencia: frecuencia('con-base', 40) }),
      row({ tenant: { publicId: 'nodisp', nombre: 'ND' }, frecuencia: frecuencia('no-disponible', null) }),
      row({ tenant: { publicId: 'sin10', nombre: 'S10' }, frecuencia: frecuencia('sin-base', null), diasRestantes: 10 }),
      row({ tenant: { publicId: 'con5', nombre: 'C5' }, frecuencia: frecuencia('con-base', 5) }),
      row({ tenant: { publicId: 'sin3', nombre: 'S3' }, frecuencia: frecuencia('sin-base', null), diasRestantes: 3 }),
    ]
    const ordenado = [...filas].sort(comparePlatformLiveTrialRows)
    assert.deepEqual(
      ordenado.map((f) => f.tenant.publicId),
      ['sin3', 'sin10', 'con5', 'con40', 'nodisp']
    )
  })

  test('CA-05 · orden estable entre consultas: mismo empate, mismo orden en dos "cargas" seguidas', ({
    assert,
  }) => {
    const a = row({ tenant: { publicId: 'empate-a', nombre: 'A' }, frecuencia: frecuencia('con-base', 30), diasRestantes: 4 })
    const b = row({ tenant: { publicId: 'empate-b', nombre: 'B' }, frecuencia: frecuencia('con-base', 30), diasRestantes: 4 })

    const cargaUno = [b, a].sort(comparePlatformLiveTrialRows)
    const cargaDos = [a, b].sort(comparePlatformLiveTrialRows)

    assert.deepEqual(cargaUno.map((f) => f.tenant.publicId), ['empate-a', 'empate-b'])
    assert.deepEqual(cargaDos.map((f) => f.tenant.publicId), ['empate-a', 'empate-b'])
  })
})

// ─── RN-49/F20, RN-53, regla local "fallo global ≠ fallo de fila" ──────────

function makeTrialRef(overrides: Partial<PlatformLiveTrialRef> = {}): PlatformLiveTrialRef {
  return {
    businessUnitId: 1,
    publicId: 'pub-1',
    nombre: 'Tenant 1',
    trial: {
      inicio: '2026-01-01',
      fin: '2026-01-10',
      finEfectivo: '2026-01-05',
      diasContratados: 10,
      diasTranscurridos: 5,
      diasRestantes: 5,
      estado: 'viva',
      resultado: null,
      fechaResultado: null,
    },
    ...overrides,
  }
}

function makeTrialServiceFake(refs: PlatformLiveTrialRef[]): PlatformTrialService {
  return { listLiveTrials: async () => refs } as unknown as PlatformTrialService
}

function makeMilestoneServiceFake(
  byBu: Map<number, TenantMilestone[]>
): PlatformTenantMilestoneService {
  return {
    resolveMilestones: async (ids: number[]) => {
      const result = new Map<number, TenantMilestone[]>()
      for (const id of ids) {
        if (byBu.has(id)) result.set(id, byBu.get(id)!)
      }
      return result
    },
  } as unknown as PlatformTenantMilestoneService
}

function makeUsageServiceFake(
  resolve: (businessUnitId: number, ventana: { inicio: string; fin: string }) => Promise<PlatformLiveTrialRow['frecuencia']>
): PlatformTrialUsageService {
  return { resolveFrecuencia: resolve } as unknown as PlatformTrialUsageService
}

function makeMilestones(count: number): TenantMilestone[] {
  const numeros: Array<1 | 2 | 3 | 4 | 5 | 6 | 8> = [1, 2, 3, 4, 5, 6, 8]
  const claves: TenantMilestone['clave'][] = [
    'estructura',
    'turnos',
    'empleado-con-turno',
    'acceso-app',
    'biometrico',
    'primera-checada-real',
    'expediente',
  ]
  return numeros.map((numero, i) => ({
    numero,
    clave: claves[i]!,
    cumplido: i < count,
    fecha: i < count ? '2026-01-01' : null,
  }))
}

test.group('PlatformLiveTrialService.listLiveTrials — orquestación', () => {
  test('universo vacío → {total:0, pruebas:[]}, sin invocar hitos ni frecuencia (RN-39)', async ({
    assert,
  }) => {
    let milestonesCalled = false
    let usageCalled = false
    const service = new PlatformLiveTrialService(fakeI18n(), {
      trialService: makeTrialServiceFake([]),
      milestoneService: {
        resolveMilestones: async () => {
          milestonesCalled = true
          return new Map()
        },
      } as unknown as PlatformTenantMilestoneService,
      usageService: makeUsageServiceFake(async () => {
        usageCalled = true
        return frecuencia('con-base', 0)
      }),
    })

    const result = await service.listLiveTrials()
    assert.deepEqual(result, { total: 0, pruebas: [] })
    assert.isFalse(milestonesCalled)
    assert.isFalse(usageCalled)
  })

  test('RN-49/F20: cruce estrictamente por businessUnitId, nunca por posición — se revuelve el orden a propósito', async ({
    assert,
  }) => {
    const refA = makeTrialRef({
      businessUnitId: 10,
      publicId: 'pub-a',
      nombre: 'A',
      trial: { ...makeTrialRef().trial, diasRestantes: 3, fin: '2026-01-04' },
    })
    const refB = makeTrialRef({
      businessUnitId: 20,
      publicId: 'pub-b',
      nombre: 'B',
      trial: { ...makeTrialRef().trial, diasRestantes: 9, fin: '2026-01-10' },
    })

    const milestonesByBu = new Map<number, TenantMilestone[]>([
      [20, makeMilestones(7)], // B: todos cumplidos
      [10, makeMilestones(1)], // A: solo uno
    ])

    const service = new PlatformLiveTrialService(fakeI18n(), {
      trialService: makeTrialServiceFake([refA, refB]),
      milestoneService: makeMilestoneServiceFake(milestonesByBu),
      usageService: makeUsageServiceFake(async (businessUnitId) => {
        if (businessUnitId === 20) return frecuencia('con-base', 90)
        return frecuencia('con-base', 10)
      }),
    })

    const { pruebas } = await service.listLiveTrials()
    const filaA = pruebas.find((r) => r.tenant.publicId === 'pub-a')!
    const filaB = pruebas.find((r) => r.tenant.publicId === 'pub-b')!

    assert.equal(filaA.hitosCumplidos, 1)
    assert.equal(filaA.hitosTotales, 7)
    assert.equal(filaA.diasRestantes, 3)
    assert.equal(filaA.frecuencia.porcentaje, 10)

    assert.equal(filaB.hitosCumplidos, 7)
    assert.equal(filaB.diasRestantes, 9)
    assert.equal(filaB.frecuencia.porcentaje, 90)
  })

  test('RN-53: el fallo del motor en UNA empresa la marca no-disponible sin tumbar el resto (200)', async ({
    assert,
  }) => {
    const refOk = makeTrialRef({ businessUnitId: 1, publicId: 'ok', nombre: 'OK' })
    const refRota = makeTrialRef({ businessUnitId: 2, publicId: 'rota', nombre: 'Rota' })

    const service = new PlatformLiveTrialService(fakeI18n(), {
      trialService: makeTrialServiceFake([refOk, refRota]),
      milestoneService: makeMilestoneServiceFake(
        new Map([
          [1, makeMilestones(3)],
          [2, makeMilestones(3)],
        ])
      ),
      usageService: makeUsageServiceFake(async (businessUnitId) => {
        if (businessUnitId === 2) throw new Error('el motor truena para este tenant (simulado)')
        return frecuencia('con-base', 33)
      }),
    })

    const { total, pruebas } = await service.listLiveTrials()
    assert.equal(total, 2)

    const filaOk = pruebas.find((r) => r.tenant.publicId === 'ok')!
    const filaRota = pruebas.find((r) => r.tenant.publicId === 'rota')!

    assert.equal(filaOk.frecuencia.estado, 'con-base')
    assert.equal(filaOk.frecuencia.porcentaje, 33)

    assert.equal(filaRota.frecuencia.estado, 'no-disponible')
    assert.isNull(filaRota.frecuencia.porcentaje)
    // no-disponible es el tercer grupo: siempre después de con-base (RN-36).
    assert.isAbove(pruebas.indexOf(filaRota), pruebas.indexOf(filaOk))
  })

  test('fallo global: si el universo entero falla, el error se propaga — no hay lista parcial silenciosa', async ({
    assert,
  }) => {
    const service = new PlatformLiveTrialService(fakeI18n(), {
      trialService: {
        listLiveTrials: async () => {
          throw new Error('fallo del universo (simulado)')
        },
      } as unknown as PlatformTrialService,
      milestoneService: makeMilestoneServiceFake(new Map()),
      usageService: makeUsageServiceFake(async () => frecuencia('con-base', 0)),
    })

    await assert.rejects(() => service.listLiveTrials(), 'fallo del universo (simulado)')
  })

  test('fallo global: si el lote de hitos falla, el error se propaga — no degrada a filas parciales', async ({
    assert,
  }) => {
    const ref = makeTrialRef()
    const service = new PlatformLiveTrialService(fakeI18n(), {
      trialService: makeTrialServiceFake([ref]),
      milestoneService: {
        resolveMilestones: async () => {
          throw new Error('fallo del lote de hitos (simulado)')
        },
      } as unknown as PlatformTenantMilestoneService,
      usageService: makeUsageServiceFake(async () => frecuencia('con-base', 0)),
    })

    await assert.rejects(() => service.listLiveTrials(), 'fallo del lote de hitos (simulado)')
  })

  test('§7 · hitos ausentes para un businessUnitId del universo LANZAN — nunca se degradan a hitosCumplidos: 0', async ({
    assert,
  }) => {
    const refConHitos = makeTrialRef({ businessUnitId: 1, publicId: 'con-hitos' })
    const refSinHitos = makeTrialRef({ businessUnitId: 2, publicId: 'sin-hitos-en-el-lote' })

    const service = new PlatformLiveTrialService(fakeI18n(), {
      trialService: makeTrialServiceFake([refConHitos, refSinHitos]),
      // El lote solo responde para businessUnitId=1 — el contrato de
      // USRH1789079078170 garantiza que esto no pasa en producción, pero si
      // pasara, esta HU debe fallar ruidoso, no silencioso.
      milestoneService: makeMilestoneServiceFake(new Map([[1, makeMilestones(2)]])),
      usageService: makeUsageServiceFake(async () => frecuencia('con-base', 0)),
    })

    const error = await service.listLiveTrials().catch((e: unknown) => e)
    assert.instanceOf(error, Error)
    assert.include((error as Error).message, 'businessUnitId=2')
  })

  test('la lista final ya viene ordenada (integra el comparador, no solo lo expone)', async ({ assert }) => {
    const refBajo = makeTrialRef({ businessUnitId: 1, publicId: 'bajo', nombre: 'Bajo' })
    const refAlto = makeTrialRef({ businessUnitId: 2, publicId: 'alto', nombre: 'Alto' })
    const refSinBase = makeTrialRef({ businessUnitId: 3, publicId: 'sinbase', nombre: 'SinBase' })

    const service = new PlatformLiveTrialService(fakeI18n(), {
      trialService: makeTrialServiceFake([refAlto, refBajo, refSinBase]),
      milestoneService: makeMilestoneServiceFake(
        new Map([
          [1, makeMilestones(0)],
          [2, makeMilestones(0)],
          [3, makeMilestones(0)],
        ])
      ),
      usageService: makeUsageServiceFake(async (businessUnitId) => {
        if (businessUnitId === 1) return frecuencia('con-base', 20)
        if (businessUnitId === 2) return frecuencia('con-base', 80)
        return frecuencia('sin-base', null)
      }),
    })

    const { pruebas } = await service.listLiveTrials()
    assert.deepEqual(
      pruebas.map((r) => r.tenant.publicId),
      ['sinbase', 'bajo', 'alto']
    )
  })
})

// ─── CA-12: una sola corrida del motor por prueba, nunca en lote ──────────

function makeFakeAttendanceStatsService(): {
  service: AttendanceStatsService
  calls: ResolvedScope[]
} {
  const calls: ResolvedScope[] = []
  const service = {
    async getOverview(
      filters: AttendanceStatsFilters,
      scope: ResolvedScope
    ): Promise<ServiceResult<OverviewResponse>> {
      calls.push(scope)
      const statistics: OverviewStatistics = {
        assists: 1,
        tolerances: 0,
        delays: 0,
        earlyOuts: 0,
        faults: 0,
        justifiedAbsences: 0,
        vacations: 0,
        holidays: 0,
        totalAvailable: 1,
        ontimePercentage: 100,
        tolerancePercentage: 0,
        delayPercentage: 0,
        earlyOutPercentage: 0,
        faultPercentage: 0,
        employeesQty: 1,
      }
      const overview: OverviewResponse = {
        statistics,
        period: { startDay: filters.startDay, endDay: filters.endDay, evaluableDays: 1 },
        daily: [],
      }
      return { status: 200, type: 'success', title: '', message: '', data: overview }
    },
  } as unknown as AttendanceStatsService
  return { service, calls }
}

test.group('CA-12 · una sola llamada al motor por prueba viva, nunca en lote (F21)', () => {
  test('el motor se invoca N veces, cada una con allowedBusinessUnitIds de exactamente un elemento', async ({
    assert,
  }) => {
    const { service: fakeAttendance, calls } = makeFakeAttendanceStatsService()
    // Servicio de uso REAL (no un doble): así CA-12 prueba la composición
    // completa hasta la frontera del motor, no solo una promesa de que "se
    // llamaría bien".
    const usageService = new PlatformTrialUsageService(fakeI18n(), fakeAttendance)

    const refs = [
      makeTrialRef({ businessUnitId: 1, publicId: 'p1' }),
      makeTrialRef({ businessUnitId: 2, publicId: 'p2' }),
      makeTrialRef({ businessUnitId: 3, publicId: 'p3' }),
    ]

    const service = new PlatformLiveTrialService(fakeI18n(), {
      trialService: makeTrialServiceFake(refs),
      milestoneService: makeMilestoneServiceFake(
        new Map([
          [1, makeMilestones(0)],
          [2, makeMilestones(0)],
          [3, makeMilestones(0)],
        ])
      ),
      usageService,
    })

    await service.listLiveTrials()

    // Prohibido pasar los N businessUnitIds en una sola llamada (§7): el
    // motor invocado UNA vez con un scope de 3 elementos sumaría las tres
    // empresas en un solo resultado que "parece correcto".
    assert.equal(calls.length, 3)
    for (const call of calls) {
      assert.equal(call.allowedBusinessUnitIds.length, 1)
    }
    const idsLlamados = calls.map((c) => c.allowedBusinessUnitIds[0]).sort((a, b) => a - b)
    assert.deepEqual(idsLlamados, [1, 2, 3])
  })
})
