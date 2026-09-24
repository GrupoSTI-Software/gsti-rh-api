import { test } from '@japa/runner'
import type { I18n } from '@adonisjs/i18n'
import PlatformLiveTrialsService, {
  comparePlatformLiveTrialRows,
  type PlatformLiveTrialRow,
} from '#services/platform_live_trials_service'
import type { PlatformLiveTrialRef } from '#services/platform_trial_service'
import type PlatformTrialService from '#services/platform_trial_service'
import type PlatformTenantMilestoneService from '#services/platform_tenant_milestone_service'
import type { TenantMilestone } from '#services/platform_tenant_milestone_service'
import type PlatformTrialUsageService from '#services/platform_trial_usage_service'
import type { TrialFrecuencia } from '#services/platform_trial_usage_service'

/**
 * USRH1789079078173 — reglas puras del listado (RN-6, RN-8, RN-9, RN-10,
 * RN-11) probadas sin BD, con dobles inyectados en las tres dependencias.
 * El universo real, sembrado, el motor de verdad y el transporte HTTP van en
 * el spec funcional (`platform_live_trials_metrics.spec.ts`), igual que
 * 078171/078172 (misma disciplina de la suite).
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
    frecuencia: { estado: 'con-base', porcentaje: 50, registros: 5, empleadoDiasEvaluables: 10, empleadosEvaluados: 1 },
    ...overrides,
  }
}

function frecuencia(overrides: Partial<TrialFrecuencia> = {}): TrialFrecuencia {
  return {
    estado: 'con-base',
    porcentaje: 50,
    registros: 5,
    empleadoDiasEvaluables: 10,
    empleadosEvaluados: 1,
    ...overrides,
  }
}

// ─── RN-10/RN-11: orden puro ─────────────────────────────────────────────────

test.group('comparePlatformLiveTrialRows (pura) — orden del listado (RN-10, RN-11)', () => {
  test('sin-base siempre antes que con-base, sin importar porcentaje/diasRestantes', ({ assert }) => {
    const sinBase = row({ frecuencia: frecuencia({ estado: 'sin-base', porcentaje: null }), diasRestantes: 20 })
    const conBase = row({ frecuencia: frecuencia({ estado: 'con-base', porcentaje: 5 }), diasRestantes: 1 })
    assert.isBelow(comparePlatformLiveTrialRows(sinBase, conBase), 0)
    assert.isAbove(comparePlatformLiveTrialRows(conBase, sinBase), 0)
  })

  test('no-disponible siempre al final, incluso con menos días restantes que las demás', ({ assert }) => {
    const noDisponible = row({
      frecuencia: frecuencia({ estado: 'no-disponible', porcentaje: null }),
      diasRestantes: 1,
    })
    const conBase = row({ frecuencia: frecuencia({ estado: 'con-base', porcentaje: 90 }), diasRestantes: 20 })
    assert.isAbove(comparePlatformLiveTrialRows(noDisponible, conBase), 0)
    assert.isBelow(comparePlatformLiveTrialRows(conBase, noDisponible), 0)
  })

  test('dentro de con-base, ordena de menor a mayor porcentaje', ({ assert }) => {
    const bajo = row({ frecuencia: frecuencia({ estado: 'con-base', porcentaje: 10 }) })
    const alto = row({ frecuencia: frecuencia({ estado: 'con-base', porcentaje: 90 }) })
    assert.isBelow(comparePlatformLiveTrialRows(bajo, alto), 0)
    assert.isAbove(comparePlatformLiveTrialRows(alto, bajo), 0)
  })

  test('dentro del mismo grupo/porcentaje, ordena por diasRestantes ascendente', ({ assert }) => {
    const venceAntes = row({
      frecuencia: frecuencia({ estado: 'con-base', porcentaje: 50 }),
      diasRestantes: 1,
    })
    const venceDespues = row({
      frecuencia: frecuencia({ estado: 'con-base', porcentaje: 50 }),
      diasRestantes: 10,
    })
    assert.isBelow(comparePlatformLiveTrialRows(venceAntes, venceDespues), 0)
  })

  test('desempate final por publicId ascendente — determinismo entre cargas', ({ assert }) => {
    const a = row({ tenant: { publicId: 'aaa', nombre: 'A' } })
    const b = row({ tenant: { publicId: 'bbb', nombre: 'B' } })
    assert.isBelow(comparePlatformLiveTrialRows(a, b), 0)
    assert.equal(comparePlatformLiveTrialRows(a, a), 0)
  })

  test('RN-11: hitosCumplidos NUNCA altera el orden — dos filas idénticas salvo hitos quedan en orden estable', ({
    assert,
  }) => {
    const pocosHitos = row({ tenant: { publicId: 'zzz', nombre: 'Pocos' }, hitosCumplidos: 0 })
    const muchosHitos = row({ tenant: { publicId: 'zzz', nombre: 'Pocos' }, hitosCumplidos: 7 })
    assert.equal(comparePlatformLiveTrialRows(pocosHitos, muchosHitos), 0)
  })

  test('orden extremo a extremo con un arreglo mixto de los tres grupos', ({ assert }) => {
    const filas: PlatformLiveTrialRow[] = [
      row({ tenant: { publicId: 'c', nombre: 'C' }, frecuencia: frecuencia({ estado: 'con-base', porcentaje: 80 }) }),
      row({ tenant: { publicId: 'n', nombre: 'N' }, frecuencia: frecuencia({ estado: 'no-disponible', porcentaje: null }) }),
      row({ tenant: { publicId: 's', nombre: 'S' }, frecuencia: frecuencia({ estado: 'sin-base', porcentaje: null }) }),
      row({ tenant: { publicId: 'b', nombre: 'B' }, frecuencia: frecuencia({ estado: 'con-base', porcentaje: 20 }) }),
    ]
    const ordenado = [...filas].sort(comparePlatformLiveTrialRows)
    assert.deepEqual(
      ordenado.map((f) => f.tenant.publicId),
      ['s', 'b', 'c', 'n']
    )
  })
})

// ─── RN-6/RN-8/RN-9: orquestación con dobles ─────────────────────────────────

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
      for (const id of ids) result.set(id, byBu.get(id) ?? [])
      return result
    },
  } as unknown as PlatformTenantMilestoneService
}

function makeUsageServiceFake(
  resolve: (businessUnitId: number, ventana: { inicio: string; fin: string }) => Promise<TrialFrecuencia>
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

test.group('PlatformLiveTrialsService.listLiveTrials — orquestación (RN-6, RN-8, RN-9)', () => {
  test('universo vacío → lista vacía, sin invocar hitos ni frecuencia', async ({ assert }) => {
    let milestonesCalled = false
    let usageCalled = false
    const service = new PlatformLiveTrialsService(fakeI18n(), {
      trialService: makeTrialServiceFake([]),
      milestoneService: {
        resolveMilestones: async () => {
          milestonesCalled = true
          return new Map()
        },
      } as unknown as PlatformTenantMilestoneService,
      usageService: makeUsageServiceFake(async () => {
        usageCalled = true
        return frecuencia()
      }),
    })

    const rows = await service.listLiveTrials()
    assert.deepEqual(rows, [])
    assert.isFalse(milestonesCalled)
    assert.isFalse(usageCalled)
  })

  test('RN-6: cruce estrictamente por businessUnitId, nunca por posición — se revuelve el orden a propósito', async ({
    assert,
  }) => {
    // Universo entrega A, B en ese orden; los mapas de hitos/frecuencia
    // llegan resueltos con B primero. Si el código cruzara por índice en vez
    // de por `businessUnitId`, A recibiría los datos de B y viceversa.
    const refA = makeTrialRef({ businessUnitId: 10, publicId: 'pub-a', nombre: 'A', trial: { ...makeTrialRef().trial, diasRestantes: 3 } })
    const refB = makeTrialRef({ businessUnitId: 20, publicId: 'pub-b', nombre: 'B', trial: { ...makeTrialRef().trial, diasRestantes: 9 } })

    const milestonesByBu = new Map<number, TenantMilestone[]>([
      [20, makeMilestones(7)], // B: todos cumplidos
      [10, makeMilestones(1)], // A: solo uno
    ])

    const service = new PlatformLiveTrialsService(fakeI18n(), {
      trialService: makeTrialServiceFake([refA, refB]),
      milestoneService: makeMilestoneServiceFake(milestonesByBu),
      usageService: makeUsageServiceFake(async (businessUnitId) => {
        // La frecuencia de B es mejor que la de A — otra pareja de valores
        // distinguible para detectar un cruce cruzado.
        if (businessUnitId === 20) return frecuencia({ porcentaje: 90 })
        return frecuencia({ porcentaje: 10 })
      }),
    })

    const rows = await service.listLiveTrials()
    const filaA = rows.find((r) => r.tenant.publicId === 'pub-a')!
    const filaB = rows.find((r) => r.tenant.publicId === 'pub-b')!

    assert.equal(filaA.hitosCumplidos, 1)
    assert.equal(filaA.diasRestantes, 3)
    assert.equal(filaA.frecuencia.porcentaje, 10)

    assert.equal(filaB.hitosCumplidos, 7)
    assert.equal(filaB.diasRestantes, 9)
    assert.equal(filaB.frecuencia.porcentaje, 90)
  })

  test('RN-8: el fallo del motor en UNA empresa la marca no-disponible sin tumbar el resto', async ({
    assert,
  }) => {
    const refOk = makeTrialRef({ businessUnitId: 1, publicId: 'ok', nombre: 'OK' })
    const refRota = makeTrialRef({ businessUnitId: 2, publicId: 'rota', nombre: 'Rota' })

    const service = new PlatformLiveTrialsService(fakeI18n(), {
      trialService: makeTrialServiceFake([refOk, refRota]),
      milestoneService: makeMilestoneServiceFake(new Map()),
      usageService: makeUsageServiceFake(async (businessUnitId) => {
        if (businessUnitId === 2) throw new Error('el motor truena para este tenant (simulado)')
        return frecuencia({ estado: 'con-base', porcentaje: 33 })
      }),
    })

    const rows = await service.listLiveTrials()
    assert.lengthOf(rows, 2)

    const filaOk = rows.find((r) => r.tenant.publicId === 'ok')!
    const filaRota = rows.find((r) => r.tenant.publicId === 'rota')!

    assert.equal(filaOk.frecuencia.estado, 'con-base')
    assert.equal(filaOk.frecuencia.porcentaje, 33)

    assert.equal(filaRota.frecuencia.estado, 'no-disponible')
    assert.isNull(filaRota.frecuencia.porcentaje)
    assert.equal(filaRota.frecuencia.registros, 0)
    assert.equal(filaRota.frecuencia.empleadoDiasEvaluables, 0)
    assert.equal(filaRota.frecuencia.empleadosEvaluados, 0)
  })

  test('RN-9: si el universo entero falla, el error se propaga — no hay lista parcial silenciosa', async ({
    assert,
  }) => {
    const service = new PlatformLiveTrialsService(fakeI18n(), {
      trialService: {
        listLiveTrials: async () => {
          throw new Error('fallo del universo (simulado)')
        },
      } as unknown as PlatformTrialService,
      milestoneService: makeMilestoneServiceFake(new Map()),
      usageService: makeUsageServiceFake(async () => frecuencia()),
    })

    await assert.rejects(() => service.listLiveTrials(), 'fallo del universo (simulado)')
  })

  test('RN-9: si el lote de hitos falla, el error se propaga — no degrada a filas parciales', async ({
    assert,
  }) => {
    const ref = makeTrialRef()
    const service = new PlatformLiveTrialsService(fakeI18n(), {
      trialService: makeTrialServiceFake([ref]),
      milestoneService: {
        resolveMilestones: async () => {
          throw new Error('fallo del lote de hitos (simulado)')
        },
      } as unknown as PlatformTenantMilestoneService,
      usageService: makeUsageServiceFake(async () => frecuencia()),
    })

    await assert.rejects(() => service.listLiveTrials(), 'fallo del lote de hitos (simulado)')
  })

  test('la lista final ya viene ordenada (integra el comparador, no solo lo expone)', async ({ assert }) => {
    const refBajo = makeTrialRef({ businessUnitId: 1, publicId: 'bajo', nombre: 'Bajo' })
    const refAlto = makeTrialRef({ businessUnitId: 2, publicId: 'alto', nombre: 'Alto' })
    const refSinBase = makeTrialRef({ businessUnitId: 3, publicId: 'sinbase', nombre: 'SinBase' })

    const service = new PlatformLiveTrialsService(fakeI18n(), {
      trialService: makeTrialServiceFake([refAlto, refBajo, refSinBase]),
      milestoneService: makeMilestoneServiceFake(new Map()),
      usageService: makeUsageServiceFake(async (businessUnitId) => {
        if (businessUnitId === 1) return frecuencia({ estado: 'con-base', porcentaje: 20 })
        if (businessUnitId === 2) return frecuencia({ estado: 'con-base', porcentaje: 80 })
        return frecuencia({ estado: 'sin-base', porcentaje: null })
      }),
    })

    const rows = await service.listLiveTrials()
    assert.deepEqual(
      rows.map((r) => r.tenant.publicId),
      ['sinbase', 'bajo', 'alto']
    )
  })
})
