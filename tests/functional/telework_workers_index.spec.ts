import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import {
  makeTeleworkSuppliesService,
  TeleworkSuppliesService,
} from '#modules/assets/telework_supplies.service'
import type { TeleworkSuppliesSummary } from '#modules/assets/dto/telework_supplies.dto'
import TeleworkWorkerService, {
  type TeleworkWorkerRowWithSupplies,
} from '#services/telework_worker_service'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'
import { cleanupOrgChartFixtures } from '#tests/helpers/org_chart_fixtures'
import {
  addRoleModulePermissions,
  assertModuleEnforced,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import { attachBusinessUnitsWithRole } from '#helpers/attach_business_units_with_role'
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

/** Resumen de insumos que el listado adjunta a cada fila con `supplies:read`. */
interface ListadoSummary {
  applies: boolean
  isLegallyRequired: boolean
  deliveredCount: number
  shippingCount: number
  ownEquipmentCount: number
  uncoveredCount: number
  unsignedCustodyCount: number
}

/** Fila del listado en la respuesta HTTP (subset que asserta este grupo). */
interface ListadoRow {
  employeeId: number
  employeeCode: number | string
  fullName: string
  position: string
  workSchedule: string
  teleworkPercentage: number
  workplaces: unknown[]
  employeeSlug?: string
  teleworkSuppliesSummary?: ListadoSummary
}

/** Las siete llaves del contrato base: exactamente lo que ve un rol sin `supplies:read`. */
const CONTRACT_KEYS = [
  'employeeCode',
  'employeeId',
  'fullName',
  'position',
  'teleworkPercentage',
  'workSchedule',
  'workplaces',
]

/** Sustituye `logger.error` por un espía y devuelve las llamadas y la restauración. */
function spyOnLoggerError(): { calls: unknown[][]; restore: () => void } {
  const calls: unknown[][] = []
  const original = logger.error.bind(logger)
  // El tipado de pino declara varias sobrecargas; el espía solo acumula.
  ;(logger as unknown as { error: (...args: unknown[]) => void }).error = (...args: unknown[]) => {
    calls.push(args)
  }
  return {
    calls,
    restore: () => {
      ;(logger as unknown as { error: unknown }).error = original
    },
  }
}

/**
 * Estado de insumos en el listado — parte 2: la superficie HTTP de
 * `GET /api/nom037/telework-workers`. Convenciones del molde
 * `telework_compliance_settings.spec.ts` (actores con email único, cleanup
 * explícito, header `X-Business-Unit-Id` con el UUID público de la empresa);
 * activos, tipos con categoría y resguardos con la forma de
 * `assets_telework_supplies.spec.ts`.
 */
test.group('Estado de insumos en el listado — endpoint HTTP', (group) => {
  /** Espía del lector: cuenta llamadas, captura argumentos y puede reventar (CA-12). */
  interface SuppliesSpy {
    calls: Array<{ businessUnitIds: readonly number[]; employeeIds: readonly number[] }>
    shouldThrow: boolean
  }

  const prototype = TeleworkSuppliesService.prototype
  let originalSummarize: typeof prototype.summarizeForEmployees | undefined
  let spy: SuppliesSpy

  function installSpy(): SuppliesSpy {
    const created: SuppliesSpy = { calls: [], shouldThrow: false }
    originalSummarize = prototype.summarizeForEmployees
    prototype.summarizeForEmployees = async function (
      this: TeleworkSuppliesService,
      businessUnitIds: readonly number[],
      employeeIds: readonly number[]
    ) {
      if (created.shouldThrow) throw new Error('fallo interno de prueba')
      created.calls.push({ businessUnitIds, employeeIds })
      return originalSummarize!.call(this, businessUnitIds, employeeIds)
    }
    return created
  }

  function restoreSpy(): void {
    if (originalSummarize) prototype.summarizeForEmployees = originalSummarize
  }

  let actorLectura: TenantActor | null = null
  let actorSoloListado: TenantActor | null = null
  let actorEmpresaB: TenantActor | null = null
  let actorSinPermisoListado: TenantActor | null = null

  let ana: EmployeeFixture | null = null
  let luis: EmployeeFixture | null = null
  let marta: EmployeeFixture | null = null
  let pedro: EmployeeFixture | null = null
  let sofia: EmployeeFixture | null = null
  let bruno: EmployeeFixture | null = null

  const createdTypeIds: number[] = []
  const createdSupplyIds: number[] = []
  const createdAssignmentIds: number[] = []
  const createdEmployeeIds: number[] = []
  const createdPersonIds: number[] = []

  let fileNumberSeq = 0
  const baseFileNumber = 1_000_000 + (Date.now() % 800_000_000)

  const actorLecturaReq = () => required(actorLectura, 'el actor de lectura')
  const actorSoloListadoReq = () => required(actorSoloListado, 'el actor solo listado')
  const actorEmpresaBReq = () => required(actorEmpresaB, 'el actor de la empresa B')

  const buIdA = () => actorLecturaReq().businessUnit.businessUnitId
  const buIdB = () => actorEmpresaBReq().businessUnit.businessUnitId
  const publicIdA = () => actorLecturaReq().businessUnit.businessUnitPublicId
  const publicIdB = () => actorEmpresaBReq().businessUnit.businessUnitPublicId

  /** Id del colaborador de un fixture concreto del roster. */
  const idOf = (fixture: EmployeeFixture | null, name: string) =>
    required(fixture, `el colaborador ${name}`).employee.employeeId

  /** Colaborador del listado: modalidad y porcentaje por tabla (el fixture nace Onsite). */
  async function makeTeleworker(
    businessUnitId: number,
    label: string,
    schedule: 'Remote' | 'Hybrid',
    percentage: number
  ): Promise<EmployeeFixture> {
    const fixture = await createEmployeeFixture(businessUnitId, `list-${label}-${RUN.slice(-6)}`)
    createdEmployeeIds.push(fixture.employee.employeeId)
    createdPersonIds.push(fixture.person.personId)
    await db
      .from('employees')
      .where('employee_id', fixture.employee.employeeId)
      .update({
        employee_work_schedule: schedule,
        employee_telework_percentage: percentage,
      })
    return fixture
  }

  /** Tipo de insumo con la categoría de teletrabajo que consume la matriz (por tabla). */
  async function makeSupplyType(
    businessUnitId: number,
    category: 'ergonomic_chair' | 'computing_equipment'
  ): Promise<number> {
    const [typeId] = await db.table('supply_types').insert({
      business_unit_id: businessUnitId,
      supply_type_name:
        category === 'ergonomic_chair' ? 'Silla de teletrabajo' : 'Cómputo de teletrabajo',
      supply_type_slug: `${category}-${RUN}-${++fileNumberSeq}`,
      supply_type_telework_category: category,
      supply_type_created_at: new Date(),
    })
    const id = Number(typeId)
    createdTypeIds.push(id)
    return id
  }

  /** Activo en operación de la empresa A (por tabla, sin la API del catálogo). */
  async function makeAsset(businessUnitId: number, typeId: number, name: string): Promise<number> {
    const [supplyId] = await db.table('supplies').insert({
      business_unit_id: businessUnitId,
      supply_file_number: baseFileNumber + ++fileNumberSeq,
      supply_name: name,
      supply_type_id: typeId,
      supply_status: 'active',
      supply_created_at: new Date(),
    })
    const id = Number(supplyId)
    createdSupplyIds.push(id)
    return id
  }

  /** Asignación abierta del colaborador en la empresa A (`active` o `shipping`). */
  async function assign(
    employeeId: number,
    supplyId: number,
    status: 'active' | 'shipping'
  ): Promise<number> {
    const [assignmentId] = await db.table('employee_supplies').insert({
      employee_id: employeeId,
      supply_id: supplyId,
      business_unit_id: buIdA(),
      employee_supply_status: status,
      employee_supply_assignament_date: '2026-08-01 00:00:00',
      employee_supply_created_at: new Date(),
    })
    const id = Number(assignmentId)
    createdAssignmentIds.push(id)
    return id
  }

  /** Resguardo firmado vivo de una asignación (contrato sin borrado lógico). */
  async function signContract(assignmentId: number, businessUnitId: number): Promise<void> {
    await db.table('employee_supplies_response_contracts').insert({
      employee_supply_id: assignmentId,
      business_unit_id: businessUnitId,
      employee_supply_response_contract_uuid: `${RUN}-${assignmentId}`,
      employee_supply_response_contract_file: 'resguardo.pdf',
      employee_supply_response_contract_created_at: new Date(),
      employee_supply_response_contract_deleted_at: null,
    })
  }

  /** Petición al listado como el actor dado, con la empresa indicada por su UUID público. */
  function listadoRequest(
    client: ApiClient,
    actor: TenantActor,
    businessUnitPublicId: string,
    query = '',
    allowErrorStatus = false
  ) {
    const pending = client
      .get(`/api/nom037/telework-workers${query}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', businessUnitPublicId)
    // El cliente HTTP de pruebas revienta ante un 5xx; el caso del 500 lo pide
    // como respuesta legítima para poder inspeccionar el cuerpo.
    return allowErrorStatus
      ? pending.setup((request) => {
          request.request.ok(() => true)
        })
      : pending
  }

  /** Filas del listado 200 del actor dado (200 obligatorio: el caso decide el resto). */
  async function fetchListado(
    client: ApiClient,
    actor: TenantActor,
    businessUnitPublicId: string,
    query = ''
  ): Promise<ListadoRow[]> {
    const response = await listadoRequest(client, actor, businessUnitPublicId, query)
    response.assertStatus(200)
    return response.body().data.teleworkWorkers.data as ListadoRow[]
  }

  /** Localiza la fila por `employeeId` (nunca por posición). */
  function rowFor(rows: ListadoRow[], employeeId: number): ListadoRow {
    const found = rows.find((row) => row.employeeId === employeeId)
    if (found === undefined) {
      throw new Error(`Falta la fila del colaborador ${employeeId} en el listado.`)
    }
    return found
  }

  // El espía se re-instala por caso: cada uno arranca con su propio contador en
  // cero y ninguno hereda las llamadas del anterior (CA-7, CA-8, CA-12, RF-5).
  group.each.setup(() => {
    spy = installSpy()
  })
  group.each.teardown(() => {
    restoreSpy()
  })

  group.setup(async () => {
    await assertModuleEnforced('telework-workers')
    await assertModuleEnforced('supplies')

    actorLectura = await createTenantActor('listado-insumos-lectura')
    await grantModulePermissions(actorLectura, 'telework-workers', ['read'])
    await addRoleModulePermissions(actorLectura.role, 'supplies', ['read'])
    await addRoleModulePermissions(actorLectura.role, 'employees', ['read'])

    actorSoloListado = await createTenantActor('listado-insumos-solo-listado')
    await grantModulePermissions(actorSoloListado, 'telework-workers', ['read'])
    // El gate del dato se prueba sobre la MISMA empresa A: el usuario se liga a
    // su unidad (la pivote queda sin rol propio y el respaldo usa su rol).
    await attachBusinessUnitsWithRole(
      actorSoloListado.user,
      [buIdA()],
      actorSoloListado.role.roleId
    )

    actorEmpresaB = await createTenantActor('listado-insumos-b')
    await grantModulePermissions(actorEmpresaB, 'telework-workers', ['read'])

    // R1: cuarto actor dedicado, SIN concesiones, para el 403 del listado; no se
    // le revoca `telework-workers:read` a `actorEmpresaB`, que CA-9 necesita.
    actorSinPermisoListado = await createTenantActor('listado-insumos-sin-permiso')

    ana = await makeTeleworker(buIdA(), 'ana', 'Remote', 100)
    luis = await makeTeleworker(buIdA(), 'luis', 'Hybrid', 60)
    marta = await makeTeleworker(buIdA(), 'marta', 'Remote', 100)
    pedro = await makeTeleworker(buIdA(), 'pedro', 'Remote', 100)
    sofia = await makeTeleworker(buIdA(), 'sofia', 'Hybrid', 40)
    bruno = await makeTeleworker(buIdB(), 'bruno', 'Remote', 100)

    const chairType = await makeSupplyType(buIdA(), 'ergonomic_chair')
    const computingType = await makeSupplyType(buIdA(), 'computing_equipment')

    // Ana: silla y cómputo entregados, ambos con resguardo firmado.
    const anaChair = await assign(idOf(ana, 'Ana'), await makeAsset(buIdA(), chairType, 'Silla de Ana'), 'active')
    await signContract(anaChair, buIdA())
    const anaLaptop = await assign(idOf(ana, 'Ana'), await makeAsset(buIdA(), computingType, 'Laptop de Ana'), 'active')
    await signContract(anaLaptop, buIdA())

    // Luis: solo la silla entregada y firmada.
    const luisChair = await assign(idOf(luis, 'Luis'), await makeAsset(buIdA(), chairType, 'Silla de Luis'), 'active')
    await signContract(luisChair, buIdA())

    // Marta: silla entregada y firmada; la laptop en envío (sin resguardo).
    const martaChair = await assign(idOf(marta, 'Marta'), await makeAsset(buIdA(), chairType, 'Silla de Marta'), 'active')
    await signContract(martaChair, buIdA())
    await assign(idOf(marta, 'Marta'), await makeAsset(buIdA(), computingType, 'Laptop de Marta'), 'shipping')

    // Pedro: silla y laptop activas; la silla SIN resguardo firmado.
    await assign(idOf(pedro, 'Pedro'), await makeAsset(buIdA(), chairType, 'Silla de Pedro'), 'active')
    const pedroLaptop = await assign(idOf(pedro, 'Pedro'), await makeAsset(buIdA(), computingType, 'Laptop de Pedro'), 'active')
    await signContract(pedroLaptop, buIdA())

    // Sofía: sin insumos. Bruno (empresa B): sin insumos.
  })

  group.teardown(async () => {
    restoreSpy()
    // Orden inverso a la creación: contratos → asignaciones → activos → tipos →
    // empleados → personas → organigrama → actores.
    if (createdAssignmentIds.length > 0) {
      await db
        .from('employee_supplies_response_contracts')
        .whereIn('employee_supply_id', createdAssignmentIds)
        .delete()
      await db.from('employee_supplies').whereIn('employee_supply_id', createdAssignmentIds).delete()
    }
    if (createdSupplyIds.length > 0) {
      await db.from('supplies').whereIn('supply_id', createdSupplyIds).delete()
    }
    if (createdTypeIds.length > 0) {
      await db.from('supply_types').whereIn('supply_type_id', createdTypeIds).delete()
    }
    if (createdEmployeeIds.length > 0) {
      await db.from('employees').whereIn('employee_id', createdEmployeeIds).delete()
    }
    if (createdPersonIds.length > 0) {
      await db.from('people').whereIn('person_id', createdPersonIds).delete()
    }
    await cleanupOrgChartFixtures(actorLectura?.businessUnit.businessUnitId ?? 0)
    await cleanupOrgChartFixtures(actorEmpresaB?.businessUnit.businessUnitId ?? 0)
    // Los actores ligados a la empresa A sueltan su pivote antes de que A se borre.
    await cleanupTenantActor(actorSinPermisoListado)
    await cleanupTenantActor(actorSoloListado)
    await cleanupTenantActor(actorEmpresaB)
    await cleanupTenantActor(actorLectura)
  })

  test('Objetivo: CA-1 — completo: con supplies:read la fila trae el slug y el resumen', async ({
    client,
    assert,
  }) => {
    const rows = await fetchListado(client, actorLecturaReq(), publicIdA())

    const row = rowFor(rows, idOf(ana, 'Ana'))
    assert.equal(row.employeeSlug, required(ana, 'Ana').employee.employeeSlug)
    assert.containsSubset(row.teleworkSuppliesSummary, {
      applies: true,
      isLegallyRequired: true,
      deliveredCount: 2,
      shippingCount: 0,
      ownEquipmentCount: 0,
      uncoveredCount: 0,
      unsignedCustodyCount: 0,
    })
  })

  test('Objetivo: CA-2 — sin cubrir: solo la silla entregada deja el cómputo sin cubrir', async ({
    client,
    assert,
  }) => {
    const rows = await fetchListado(client, actorLecturaReq(), publicIdA())

    const row = rowFor(rows, idOf(luis, 'Luis'))
    assert.containsSubset(row.teleworkSuppliesSummary, {
      deliveredCount: 1,
      shippingCount: 0,
      uncoveredCount: 1,
    })
  })

  test('Objetivo: CA-3 — en envío: la laptop shipping cuenta como en envío, no como sin cubrir', async ({
    client,
    assert,
  }) => {
    const rows = await fetchListado(client, actorLecturaReq(), publicIdA())

    const row = rowFor(rows, idOf(marta, 'Marta'))
    assert.containsSubset(row.teleworkSuppliesSummary, {
      deliveredCount: 1,
      shippingCount: 1,
      uncoveredCount: 0,
    })
  })

  test('Objetivo: CA-4 — resguardo: un entregado sin contrato sube el conteo de resguardos', async ({
    client,
    assert,
  }) => {
    const rows = await fetchListado(client, actorLecturaReq(), publicIdA())

    const row = rowFor(rows, idOf(pedro, 'Pedro'))
    assert.containsSubset(row.teleworkSuppliesSummary, {
      deliveredCount: 2,
      uncoveredCount: 0,
      unsignedCustodyCount: 1,
    })
  })

  test('Objetivo: CA-5 — umbral: el 40% exacto entra al listado y es obligatorio', async ({
    client,
    assert,
  }) => {
    const rows = await fetchListado(client, actorLecturaReq(), publicIdA())

    const row = rowFor(rows, idOf(sofia, 'Sofía'))
    assert.equal(row.teleworkPercentage, 40)
    assert.containsSubset(row.teleworkSuppliesSummary, {
      applies: true,
      isLegallyRequired: true,
      uncoveredCount: 2,
    })
  })

  test('Objetivo: CA-7 — gate del dato: sin supplies:read no viajan el slug ni el resumen', async ({
    client,
    assert,
  }) => {
    const sinDato = await fetchListado(client, actorSoloListadoReq(), publicIdA())
    // El espía arranca en cero en cada caso (se reinstala en el setup): la fila
    // sin permiso se arma sin tocar al lector de insumos.
    assert.equal(spy.calls.length, 0)

    const conDato = await fetchListado(client, actorLecturaReq(), publicIdA())

    // Mismas filas (id y nombre), sin el detalle de insumos.
    assert.deepEqual(
      sinDato.map((row) => `${row.employeeId}:${row.fullName}`).sort(),
      conDato.map((row) => `${row.employeeId}:${row.fullName}`).sort()
    )
    for (const row of sinDato) {
      assert.isFalse(Object.hasOwn(row, 'employeeSlug'))
      assert.isFalse(Object.hasOwn(row, 'teleworkSuppliesSummary'))
    }
  })

  test('Objetivo: CA-8 — lote: una sola lectura con el alcance de la empresa y los cinco ids', async ({
    client,
    assert,
  }) => {
    const rows = await fetchListado(client, actorLecturaReq(), publicIdA(), '?page=1&limit=5')

    assert.lengthOf(rows, 5)
    assert.equal(spy.calls.length, 1)

    const call = required(spy.calls[0], 'la llamada al lector')
    assert.deepEqual(call.businessUnitIds, [buIdA()])

    const expected = [
      idOf(ana, 'Ana'),
      idOf(luis, 'Luis'),
      idOf(marta, 'Marta'),
      idOf(pedro, 'Pedro'),
      idOf(sofia, 'Sofía'),
    ].sort((a, b) => a - b)
    const seen = [...call.employeeIds].sort((a, b) => a - b)
    assert.deepEqual(seen, expected)
  })

  test('Objetivo: CA-9 — aislamiento: el teletrabajador de la empresa B no aparece en A', async ({
    client,
    assert,
  }) => {
    const brunoId = idOf(bruno, 'Bruno')

    // El fixture de B es real: con su propio actor encabeza el listado de SU empresa.
    const rowsB = await fetchListado(client, actorEmpresaBReq(), publicIdB())
    assert.deepEqual(rowsB.map((row) => row.employeeId), [brunoId])

    // Para la empresa A no existe: ni en el listado ni con búsqueda por su nombre.
    const rowsA = await fetchListado(client, actorLecturaReq(), publicIdA())
    assert.isFalse(rowsA.some((row) => row.employeeId === brunoId))

    const search = await fetchListado(
      client,
      actorLecturaReq(),
      publicIdA(),
      `?search=${encodeURIComponent(required(bruno, 'Bruno').person.personSecondLastname)}`
    )
    assert.lengthOf(search, 0)

    // Y el lector jamás pidió el lote de B: su id no figura en ninguna llamada.
    assert.notInclude(spy.calls.flatMap((call) => [...call.employeeIds]), brunoId)
  })

  test('Objetivo: CA-12 — error sin fuga: el 500 no expone el mensaje interno y lo manda al log', async ({
    client,
    assert,
  }) => {
    spy.shouldThrow = true
    const loggerSpy = spyOnLoggerError()
    try {
      const response = await listadoRequest(client, actorLecturaReq(), publicIdA(), '', true)
      response.assertStatus(500)

      const body = response.body()
      assert.equal(body.key, 'error-inesperado')
      assert.equal(body.code, 'TWK.SYS.001')
      assert.isNull(body.detail)
      assert.isNull(body.data)
      assert.notInclude(JSON.stringify(body), 'fallo interno de prueba')
      assert.isAbove(loggerSpy.calls.length, 0, 'se esperaba al menos una llamada a logger.error')
    } finally {
      loggerSpy.restore()
    }
  })

  test('Objetivo: CA-13 — sin telework-workers:read el listado responde 403 y no consulta al lector', async ({
    client,
    assert,
  }) => {
    const actor = required(actorSinPermisoListado, 'el actor sin permiso de listado')
    const response = await listadoRequest(client, actor, actor.businessUnit.businessUnitPublicId)
    response.assertStatus(403)

    const body = response.body()
    assert.equal(body.key, 'sin-permiso')
    assert.equal(body.code, 'TWK.AUTH.001')
    assert.isNull(body.detail)
    assert.equal(spy.calls.length, 0)
  })

  test('Objetivo: CA-15 — contrato intacto: sin supplies:read la fila conserva sus siete llaves', async ({
    client,
    assert,
  }) => {
    const rows = await fetchListado(client, actorSoloListadoReq(), publicIdA())

    assert.lengthOf(rows, 5)
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), CONTRACT_KEYS)
    }
  })

  test('Objetivo: Review Focus 5 — el lector que explota no se llama sin supplies:read', async ({
    client,
    assert,
  }) => {
    spy.shouldThrow = true

    const rows = await fetchListado(client, actorSoloListadoReq(), publicIdA())

    assert.lengthOf(rows, 5)
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), CONTRACT_KEYS)
    }
    assert.equal(spy.calls.length, 0)
  })
})
