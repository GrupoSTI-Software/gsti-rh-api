import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { makeTeleworkSuppliesService } from '#modules/assets/telework_supplies.service'
import type { TeleworkSuppliesSummary } from '#modules/assets/dto/telework_supplies.dto'
import TeleworkWorkerService, {
  type TeleworkWorkerRowWithSupplies,
} from '#services/telework_worker_service'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'
import {
  cleanupTenantActor,
  createTenantActor,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import { TenantContext } from '#utils/tenant_context'

/**
 * Estado de insumos en el listado de teletrabajadores (NOM-037 5.1,
 * VLRH-H1791485253301) — parte 1: el servicio, sin HTTP.
 *
 * Prueba que el servicio del listado pide el resumen por lote UNA sola vez
 * cuando la opción `includeSuppliesSummary` está activa, que con la opción por
 * defecto la fila queda idéntica a hoy (siete llaves, el lector ni se toca) y
 * que las páginas vacías y los alcances vacíos no consultan al lector. El grupo
 * HTTP sobre `GET /api/telework-workers` lo agrega la tarea siguiente sobre
 * este mismo archivo.
 */

const RUN = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

test.group('Estado de insumos en el listado — servicio (sin HTTP)', (group) => {
  let actorA: TenantActor | null = null
  let employeeA: EmployeeFixture | null = null

  const buIdA = () => required(actorA, 'el actor de A').businessUnit.businessUnitId
  const employeeIdA = () => required(employeeA, 'el colaborador de A').employee.employeeId

  /**
   * El listado consulta `employees`, que fuera de HTTP exige el alcance
   * declarado en `TenantContext` (el mismo que fija el middleware en una
   * petición real); sin él la consulta ni siquiera sale.
   */
  const listWithScope = <T>(scope: number[], run: () => Promise<T>) => TenantContext.run(scope, run)

  group.setup(async () => {
    actorA = await createTenantActor('listado-insumos-servicio-a')
    employeeA = await createEmployeeFixture(buIdA(), `listA-${RUN.slice(-6)}`)
    await db
      .from('employees')
      .where('employee_id', employeeIdA())
      .update({
        employee_work_schedule: 'Remote',
        employee_telework_percentage: 100,
        employee_deleted_at: null,
      })
  })
  group.teardown(async () => {
    await cleanupEmployeeFixture(employeeA)
    await cleanupTenantActor(actorA)
  })

  test('sin la opción, la fila queda con sus siete llaves y no se llama al lector', async ({
    assert,
  }) => {
    const calls: number[] = []
    const spy = {
      summarizeForEmployees: async () => {
        calls.push(1)
        return new Map<number, TeleworkSuppliesSummary>()
      },
    }
    const service = new TeleworkWorkerService(spy)

    const page = await listWithScope([buIdA()], () => service.list({ page: 1, limit: 5 }, [buIdA()]))

    assert.lengthOf(page.data, 1)
    assert.deepEqual(Object.keys(page.data[0]).sort(), [
      'employeeCode',
      'employeeId',
      'fullName',
      'position',
      'teleworkPercentage',
      'workSchedule',
      'workplaces',
    ])
    assert.equal(calls.length, 0)
  })

  test('con la opción, la fila trae employeeSlug y el resumen del bucle, en una sola llamada', async ({
    assert,
  }) => {
    const seen: Array<{ businessUnitIds: readonly number[]; employeeIds: readonly number[] }> = []
    const real = makeTeleworkSuppliesService()
    const spy = {
      summarizeForEmployees: async (
        businessUnitIds: readonly number[],
        employeeIds: readonly number[]
      ) => {
        seen.push({ businessUnitIds, employeeIds })
        return real.summarizeForEmployees(businessUnitIds, employeeIds)
      },
    }
    const service = new TeleworkWorkerService(spy)

    const page = await listWithScope([buIdA()], () =>
      service.list({ page: 1, limit: 5 }, [buIdA()], {
        includeSuppliesSummary: true,
      })
    )

    assert.equal(seen.length, 1)
    assert.deepEqual(seen[0].businessUnitIds, [buIdA()])
    assert.deepEqual(seen[0].employeeIds, [employeeIdA()])

    const row = page.data[0] as TeleworkWorkerRowWithSupplies
    assert.equal(row.employeeSlug, required(employeeA, 'el colaborador de A').employee.employeeSlug)
    assert.equal(row.teleworkSuppliesSummary?.applies, true)
    assert.equal(row.teleworkSuppliesSummary?.isLegallyRequired, true)
    // Sin insumos: silla y cómputo quedan `uncovered` (el aditamento no cuenta); la silla
    // entregada que da 1 vive en el escenario del spec molde, no en este fixture.
    assert.equal(row.teleworkSuppliesSummary?.uncoveredCount, 2)
  })

  test('Review Focus 1 — una página sin filas no consulta al lector', async ({ assert }) => {
    let calls = 0
    const spy = {
      summarizeForEmployees: async () => {
        calls += 1
        return new Map<number, TeleworkSuppliesSummary>()
      },
    }
    const service = new TeleworkWorkerService(spy)

    const page = await listWithScope([buIdA()], () =>
      service.list({ search: 'zzz-no-existe-zzz', page: 1, limit: 5 }, [buIdA()], {
        includeSuppliesSummary: true,
      })
    )

    assert.lengthOf(page.data, 0)
    assert.equal(calls, 0)
  })

  test('Review Focus 2 — alcance vacío devuelve página vacía y no consulta al lector', async ({
    assert,
  }) => {
    let calls = 0
    const spy = {
      summarizeForEmployees: async () => {
        calls += 1
        return new Map<number, TeleworkSuppliesSummary>()
      },
    }
    const service = new TeleworkWorkerService(spy)

    const page = await listWithScope([], () =>
      service.list({ page: 1, limit: 5 }, [], { includeSuppliesSummary: true })
    )

    assert.lengthOf(page.data, 0)
    assert.equal(calls, 0)
  })

  test('Review Focus 3 — sin entrada en el mapa, la fila queda con slug y sin resumen', async ({
    assert,
  }) => {
    const service = new TeleworkWorkerService({
      summarizeForEmployees: async () => new Map<number, TeleworkSuppliesSummary>(),
    })

    const page = await listWithScope([buIdA()], () =>
      service.list({ page: 1, limit: 5 }, [buIdA()], {
        includeSuppliesSummary: true,
      })
    )

    const row = page.data[0] as TeleworkWorkerRowWithSupplies
    assert.equal(row.employeeSlug, required(employeeA, 'el colaborador de A').employee.employeeSlug)
    assert.isFalse(Object.hasOwn(row, 'teleworkSuppliesSummary'))
  })
})
