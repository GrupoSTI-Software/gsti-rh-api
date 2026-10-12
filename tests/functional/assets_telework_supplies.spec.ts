import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import type { AssetsRepository } from '#modules/assets/assets.repository'
import AssetsRepositoryMysql from '#modules/assets/assets.repository.mysql'
import type {
  TeleworkCoverageRow,
  TeleworkProfile,
} from '#modules/assets/dto/telework_supplies.dto'
import {
  makeTeleworkSuppliesService,
  TeleworkSuppliesService,
} from '#modules/assets/telework_supplies.service'
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

/**
 * Cumplimiento de insumos de teletrabajo (NOM-037-STPS-2023 5.7,
 * VLRH-H1791485252682) — parte 1: el servicio de dominio SIN HTTP.
 *
 * Prueba que las lecturas por lote van con el alcance dentro de la query y sin
 * `TenantContext`, el porcentaje DECIMAL que llega como texto, el resumen por
 * lote (una sola pasada, ids fuera de alcance ausentes) y la composición con
 * las reglas puras. Los casos HTTP sobre `GET /api/employees/:id/telework-supplies`
 * los agrega la tarea siguiente sobre este mismo archivo.
 */

const RUN = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

/** Puerta espía: cuenta llamadas y delega al adaptador real cuando no hay dato canónico. */
interface SpyPort {
  port: AssetsRepository
  calls: { profiles: number; coverage: number }
  canned: { profiles: TeleworkProfile[] | null; coverage: TeleworkCoverageRow[] | null }
}

function spyPort(): SpyPort {
  const calls = { profiles: 0, coverage: 0 }
  const base = new AssetsRepositoryMysql()
  const canned: SpyPort['canned'] = { profiles: null, coverage: null }
  const port = {
    findTeleworkProfiles: async (
      businessUnitIds: readonly number[],
      employeeIds: readonly number[]
    ) => {
      calls.profiles += 1
      return canned.profiles ?? base.findTeleworkProfiles(businessUnitIds, employeeIds)
    },
    findTeleworkCoverage: async (
      businessUnitIds: readonly number[],
      employeeIds: readonly number[]
    ) => {
      calls.coverage += 1
      return canned.coverage ?? base.findTeleworkCoverage(businessUnitIds, employeeIds)
    },
  } as unknown as AssetsRepository

  return { port, calls, canned }
}

test.group('Insumos de teletrabajo — servicio (sin HTTP)', (group) => {
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null
  let employeeA: EmployeeFixture | null = null
  let employeeB: EmployeeFixture | null = null
  let supplyTypeId = 0
  let supplyId = 0

  const employeeIdA = () => required(employeeA, 'el colaborador de A').employee.employeeId
  const buIdA = () => required(actorA, 'el actor de A').businessUnit.businessUnitId

  /** Insumo de teletrabajo (silla) asignado abierto a A, por tabla. */
  async function createTeleworkSupplyForA(): Promise<void> {
    const businessUnitId = buIdA()
    const [typeId] = await db.table('supply_types').insert({
      business_unit_id: businessUnitId,
      supply_type_name: 'Silla de teletrabajo',
      supply_type_slug: `silla-teletrabajo-${RUN}`,
      supply_type_telework_category: 'ergonomic_chair',
      supply_type_created_at: new Date(),
    })
    supplyTypeId = Number(typeId)

    const [newSupplyId] = await db.table('supplies').insert({
      business_unit_id: businessUnitId,
      supply_file_number: 1_000_000 + (Date.now() % 800_000_000),
      supply_name: 'Silla ergonómica',
      supply_type_id: supplyTypeId,
      supply_status: 'active',
      supply_created_at: new Date(),
    })
    supplyId = Number(newSupplyId)

    await db.table('employee_supplies').insert({
      employee_id: employeeIdA(),
      supply_id: supplyId,
      business_unit_id: businessUnitId,
      employee_supply_status: 'active',
      employee_supply_assignament_date: '2026-08-01 00:00:00',
      employee_supply_created_at: new Date(),
    })
  }

  group.setup(async () => {
    actorA = await createTenantActor('insumos-servicio-a')
    actorB = await createTenantActor('insumos-servicio-b')
    employeeA = await createEmployeeFixture(actorA.businessUnit.businessUnitId, `empA-${RUN.slice(-6)}`)
    employeeB = await createEmployeeFixture(actorB.businessUnit.businessUnitId, `empB-${RUN.slice(-6)}`)

    // Modalidad por tabla: el fixture nace Onsite sin porcentaje.
    await db
      .from('employees')
      .where('employee_id', employeeA.employee.employeeId)
      .update({ employee_work_schedule: 'Remote', employee_telework_percentage: 100 })

    await createTeleworkSupplyForA()
  })

  group.teardown(async () => {
    if (supplyId !== 0) {
      await db.from('employee_supplies').where('supply_id', supplyId).delete()
      await db.from('supplies').where('supply_id', supplyId).delete()
    }
    if (supplyTypeId !== 0) {
      await db.from('supply_types').where('supply_type_id', supplyTypeId).delete()
    }
    await cleanupEmployeeFixture(employeeA)
    await cleanupEmployeeFixture(employeeB)
    await cleanupTenantActor(actorA)
    await cleanupTenantActor(actorB)
  })

  test('CA-10: el resumen por lote devuelve solo a los del alcance, sin TenantContext', async ({
    assert,
  }) => {
    const employeeIdB = required(employeeB, 'el colaborador de B').employee.employeeId

    // Sin petición HTTP: la factoría construye el servicio y el alcance viaja como argumento.
    const summary = await makeTeleworkSuppliesService().summarizeForEmployees(
      [buIdA()],
      [employeeIdA(), employeeIdB]
    )

    assert.equal(summary.size, 1)
    assert.isTrue(summary.has(employeeIdA()))
    // Ausencia ≠ ceros: un id fuera de alcance no aparece.
    assert.isFalse(summary.has(employeeIdB))

    const a = required(summary.get(employeeIdA()), 'el resumen de A')
    assert.isTrue(a.applies)
    assert.isTrue(a.isLegallyRequired)
    assert.equal(a.deliveredCount, 1)
    assert.equal(a.shippingCount, 0)
    assert.equal(a.ownEquipmentCount, 0)
    assert.equal(a.uncoveredCount, 1)
    assert.equal(a.unsignedCustodyCount, 1)
  })

  test('CA-10: lote o alcance vacíos devuelven Map vacío sin consultar el puerto', async ({
    assert,
  }) => {
    const spy = spyPort()
    const service = new TeleworkSuppliesService(spy.port)

    const byEmptyScope = await service.summarizeForEmployees([], [1])
    assert.equal(byEmptyScope.size, 0)

    const byEmptyBatch = await service.summarizeForEmployees([buIdA()], [])
    assert.equal(byEmptyBatch.size, 0)

    assert.equal(spy.calls.profiles, 0)
    assert.equal(spy.calls.coverage, 0)
  })

  test('CA-10: con 25 colaboradores el puerto recibe exactamente 2 llamadas', async ({ assert }) => {
    const spy = spyPort()
    spy.canned.profiles = Array.from({ length: 25 }, (_, index) => ({
      employeeId: 10_000 + index,
      workSchedule: 'Remote',
      teleworkPercentage: 100,
      isDeleted: false,
    }))
    spy.canned.coverage = []

    const service = new TeleworkSuppliesService(spy.port)
    const summary = await service.summarizeForEmployees(
      [buIdA()],
      spy.canned.profiles.map((profile) => profile.employeeId)
    )

    assert.equal(summary.size, 25)
    assert.equal(spy.calls.profiles, 1)
    assert.equal(spy.calls.coverage, 1)
  })

  test('RF-3: el porcentaje DECIMAL llega como texto y no se trunca', async ({ assert }) => {
    await db
      .from('employees')
      .where('employee_id', employeeIdA())
      .update({ employee_work_schedule: 'Hybrid', employee_telework_percentage: 39.99 })

    const matrix = await makeTeleworkSuppliesService().matrixForEmployee([buIdA()], employeeIdA())
    const result = required(matrix, 'la matriz de A')

    assert.equal(result.teleworkPercentage, 39.99)
    assert.isTrue(result.applies)
    assert.isFalse(result.isLegallyRequired)
    assert.equal(result.legalThresholdPercent, 40)
  })

  test('RF-4: ids repetidos en el lote no duplican el Map ni inflan los conteos', async ({
    assert,
  }) => {
    const service = makeTeleworkSuppliesService()

    const single = await service.summarizeForEmployees([buIdA()], [employeeIdA()])
    const repeated = await service.summarizeForEmployees(
      [buIdA()],
      [employeeIdA(), employeeIdA(), employeeIdA()]
    )

    assert.equal(repeated.size, 1)
    assert.deepEqual(required(repeated.get(employeeIdA()), 'el resumen repetido'), required(
      single.get(employeeIdA()),
      'el resumen único'
    ))
    assert.equal(required(repeated.get(employeeIdA()), 'el resumen repetido').deliveredCount, 1)
  })
})
