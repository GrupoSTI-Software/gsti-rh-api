import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import { ASSET_ERROR_KEYS } from '#modules/assets/assets.constants'
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
import { cleanupOrgChartFixtures } from '#tests/helpers/org_chart_fixtures'
import {
  assertModuleEnforced,
  businessUnitHeaders,
  cleanupTenantActor,
  cleanupUnitUser,
  createBypassUserInBusinessUnit,
  createTenantActor,
  grantModulePermissions,
  required,
  type TenantActor,
  type UnitUser,
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
    assert.equal(
      JSON.stringify(required(repeated.get(employeeIdA()), 'el resumen repetido')),
      JSON.stringify(required(single.get(employeeIdA()), 'el resumen único'))
    )
    assert.equal(required(repeated.get(employeeIdA()), 'el resumen repetido').deliveredCount, 1)
  })
})

/** Una de las tres categorías de insumo de teletrabajo (orden de la norma). */
type SupplyCategory = 'ergonomic_chair' | 'computing_equipment' | 'accessory'

/** Activo abierto que cubre una categoría, tal como viaja en el cuerpo HTTP. */
interface MatrixAsset {
  employeeSupplyId: number
  supplyId: number
  name: string
  fileNumber: string
  assignmentStatus: 'active' | 'shipping'
  custodyStatus: 'signed' | 'unsigned'
  assignedAt: string
}

interface MatrixCategory {
  category: SupplyCategory
  status: 'delivered' | 'shipping' | 'own_equipment' | 'uncovered' | 'not_delivered'
  assets: MatrixAsset[]
}

interface MatrixSummary {
  applies: boolean
  isLegallyRequired: boolean
  deliveredCount: number
  shippingCount: number
  ownEquipmentCount: number
  uncoveredCount: number
  unsignedCustodyCount: number
}

interface MatrixBody {
  employeeId: number
  applies: boolean
  isLegallyRequired: boolean
  teleworkPercentage: number
  legalThresholdPercent: number
  categories: MatrixCategory[]
  teleworkSuppliesSummary: MatrixSummary
}

/** Resumen de quien no aplica: `applies`/`isLegallyRequired` en falso y conteos en cero. */
const EMPTY_SUMMARY: MatrixSummary = {
  applies: false,
  isLegallyRequired: false,
  deliveredCount: 0,
  shippingCount: 0,
  ownEquipmentCount: 0,
  uncoveredCount: 0,
  unsignedCustodyCount: 0,
}

type HttpMethod = 'get' | 'post' | 'put' | 'delete'

/**
 * Cumplimiento de insumos de teletrabajo — parte 2: el endpoint
 * `GET /api/employees/:employeeId/telework-supplies` (gate `supplies:read`,
 * 404 indistinguible fuera de la empresa). El catálogo (tipos, activos y
 * asignaciones) lo arma por la API un actor `owner` de la MISMA empresa del
 * lector; los estados que solo la API de servidor no expone (devolución,
 * resguardo borrado, reclasificación del tipo, fecha de asignación nula) los
 * fija el spec por `db.table`, nunca con modelos Lucid fuera de request (el
 * patrón que rompe `supplies_permission_gate.spec.ts`). El cuerpo de la matriz
 * se asserta por subconjunto (`containsSubset`, CA-14); el 404 se compara
 * exacto serializando el cuerpo.
 */
test.group('Insumos de teletrabajo — endpoint HTTP', (group) => {
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null
  let catalogOwner: UnitUser | null = null
  let employeeB: EmployeeFixture | null = null

  let counter = 0
  const unique = (label: string) => `${label}-${RUN}-h${++counter}`
  const createdEmployeeIds: number[] = []
  const createdPersonIds: number[] = []
  const createdTypeIds: number[] = []
  const createdSupplyIds: number[] = []
  const createdAssignmentIds: number[] = []

  const buId = () => required(actorA, 'el actor A').businessUnit.businessUnitId

  function ownerCall(
    client: ApiClient,
    method: HttpMethod,
    url: string,
    body?: Record<string, unknown>
  ) {
    const owner = required(catalogOwner, 'el owner del catálogo')
    const actor = required(actorA, 'el actor A')
    const pending = client[method](url).loginAs(owner.user).headers({
      'X-Business-Unit-Id': actor.businessUnit.businessUnitPublicId,
    })
    return body ? pending.json(body) : pending
  }

  /** Colaborador nuevo en la empresa de A, con su modalidad y porcentaje. */
  async function makeEmployee(prefix: string, schedule: string, percentage: number): Promise<number> {
    const fixture = await createEmployeeFixture(buId(), `${prefix}-${RUN.slice(-6)}`)
    createdEmployeeIds.push(fixture.employee.employeeId)
    createdPersonIds.push(fixture.person.personId)
    await db
      .from('employees')
      .where('employee_id', fixture.employee.employeeId)
      .update({ employee_work_schedule: schedule, employee_telework_percentage: percentage })
    return fixture.employee.employeeId
  }

  /** Tipo de insumo (con o sin categoría de teletrabajo) por la API del owner. */
  async function makeType(
    client: ApiClient,
    name: string,
    category?: SupplyCategory
  ): Promise<number> {
    const body: Record<string, unknown> = { supplyTypeName: unique(name) }
    if (category !== undefined) body.supplyTypeTeleworkCategory = category
    const response = await ownerCall(client, 'post', '/api/supply-types', body)
    response.assertStatus(201)
    const typeId = response.body().data.supplyType.supplyTypeId as number
    createdTypeIds.push(typeId)
    return typeId
  }

  /** Activo por la API del owner; devuelve id y su folio para los asserts. */
  async function makeAsset(
    client: ApiClient,
    typeId: number,
    name: string
  ): Promise<{ supplyId: number; fileNumber: string }> {
    const fileNumber = unique('ACT')
    const response = await ownerCall(client, 'post', '/api/supplies', {
      supplyFileNumber: fileNumber,
      supplyName: unique(name),
      supplyTypeId: typeId,
    })
    response.assertStatus(201)
    const supplyId = response.body().data.supplie.supplyId as number
    createdSupplyIds.push(supplyId)
    return { supplyId, fileNumber }
  }

  /** Asignación abierta por la API del owner; el estado de envío se fija por tabla. */
  async function assign(
    client: ApiClient,
    supplyId: number,
    employeeId: number,
    options: { date?: string; status?: 'active' | 'shipping' } = {}
  ): Promise<number> {
    const response = await ownerCall(client, 'post', '/api/employee-supplies', {
      employeeId,
      supplyId,
      employeeSupplyAssignamentDate: options.date ?? '2026-08-01',
    })
    response.assertStatus(201)
    const assignmentId = response.body().data.employeeSupply.employeeSupplyId as number
    createdAssignmentIds.push(assignmentId)
    if (options.status === 'shipping') {
      await db
        .from('employee_supplies')
        .where('employee_supply_id', assignmentId)
        .update({ employee_supply_status: 'shipping' })
    }
    return assignmentId
  }

  /** Cierra la asignación (devolución) por tabla. */
  async function retire(assignmentId: number): Promise<void> {
    await db.from('employee_supplies').where('employee_supply_id', assignmentId).update({
      employee_supply_status: 'retired',
      employee_supply_retirement_date: '2026-09-01',
      employee_supply_retirement_reason: 'Cambio de equipo',
    })
  }

  /** Resguardo del activo; `deleted` lo inserta borrado lógicamente (RF-1). */
  async function signContract(assignmentId: number, deleted = false): Promise<void> {
    await db.table('employee_supplies_response_contracts').insert({
      employee_supply_id: assignmentId,
      business_unit_id: buId(),
      employee_supply_response_contract_uuid: unique('uuid'),
      employee_supply_response_contract_file: 'resguardo.pdf',
      employee_supply_response_contract_created_at: new Date(),
      employee_supply_response_contract_deleted_at: deleted ? new Date() : null,
    })
  }

  /** Consulta la matriz como el actor A (con `supplies:read`). */
  async function matrixBody(client: ApiClient, employeeId: number): Promise<MatrixBody> {
    const actor = required(actorA, 'el actor A')
    const response = await client
      .get(`/api/employees/${employeeId}/telework-supplies`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
    response.assertStatus(200)
    return response.body().data as MatrixBody
  }

  const categoryOf = (body: MatrixBody, category: SupplyCategory): MatrixCategory => {
    const found = body.categories.find((item) => item.category === category)
    if (found === undefined) throw new Error(`Falta la categoría ${category} en la matriz.`)
    return found
  }

  group.setup(async () => {
    await assertModuleEnforced('supplies')
    actorA = await createTenantActor('insumos-http-a')
    actorB = await createTenantActor('insumos-http-b')
    await grantModulePermissions(actorA, 'supplies', ['read'])
    catalogOwner = await createBypassUserInBusinessUnit(
      'owner',
      `insumos-http-owner-${RUN.slice(-6)}`,
      actorA.businessUnit.businessUnitId
    )
    employeeB = await createEmployeeFixture(actorB.businessUnit.businessUnitId, `empB-${RUN.slice(-6)}`)
  })

  group.teardown(async () => {
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
    await cleanupOrgChartFixtures(actorA?.businessUnit.businessUnitId ?? 0)
    await cleanupEmployeeFixture(employeeB)
    await cleanupUnitUser(catalogOwner)
    await cleanupTenantActor(actorA)
    await cleanupTenantActor(actorB)
  })

  test('CA-1: entregado con resguardo; uncovered y not_delivered vacíos; resumen', async ({
    client,
    assert,
  }) => {
    const employeeId = await makeEmployee('ca1', 'Remote', 100)
    const chairType = await makeType(client, 'Silla', 'ergonomic_chair')
    const chair = await makeAsset(client, chairType, 'Silla ergonómica')
    const assignmentId = await assign(client, chair.supplyId, employeeId, { date: '2026-08-01' })
    await signContract(assignmentId)

    const body = await matrixBody(client, employeeId)

    assert.containsSubset(body, {
      employeeId,
      applies: true,
      isLegallyRequired: true,
      teleworkPercentage: 100,
      categories: [
        { category: 'ergonomic_chair', status: 'delivered' },
        { category: 'computing_equipment', status: 'uncovered' },
        { category: 'accessory', status: 'not_delivered' },
      ],
      teleworkSuppliesSummary: {
        applies: true,
        isLegallyRequired: true,
        deliveredCount: 1,
        shippingCount: 0,
        ownEquipmentCount: 0,
        uncoveredCount: 1,
        unsignedCustodyCount: 0,
      },
    })
    // Orden de la norma, no del cuerpo.
    assert.equal(
      body.categories.map((item) => item.category).join(','),
      'ergonomic_chair,computing_equipment,accessory'
    )

    assert.containsSubset(categoryOf(body, 'ergonomic_chair').assets, [
      {
        employeeSupplyId: assignmentId,
        supplyId: chair.supplyId,
        fileNumber: chair.fileNumber,
        assignmentStatus: 'active',
        custodyStatus: 'signed',
        assignedAt: '2026-08-01',
      },
    ])
    assert.isEmpty(categoryOf(body, 'computing_equipment').assets)
    assert.isEmpty(categoryOf(body, 'accessory').assets)
  })

  test('CA-2: la prioridad no depende del orden de creación (R5, R6)', async ({
    client,
    assert,
  }) => {
    async function scenario(prefix: string, reverse: boolean): Promise<void> {
      const employeeId = await makeEmployee(prefix, 'Remote', 100)
      const computingType = await makeType(client, 'Cómputo', 'computing_equipment')
      const chairType = await makeType(client, 'Silla', 'ergonomic_chair')

      let laptopAssignment = 0
      let monitorAssignment = 0
      let chairRetiredAssignment = 0
      let chairShippingAssignment = 0

      async function insertComputing(flip: boolean): Promise<void> {
        for (const name of flip ? ['Monitor', 'Laptop'] : ['Laptop', 'Monitor']) {
          const isLaptop = name === 'Laptop'
          const asset = await makeAsset(client, computingType, name)
          const assignmentId = await assign(client, asset.supplyId, employeeId, {
            status: isLaptop ? 'shipping' : 'active',
          })
          if (isLaptop) laptopAssignment = assignmentId
          else monitorAssignment = assignmentId
        }
      }

      async function insertChair(flip: boolean): Promise<void> {
        for (const name of flip ? ['Silla en envío', 'Silla devuelta'] : ['Silla devuelta', 'Silla en envío']) {
          const shipping = name === 'Silla en envío'
          const asset = await makeAsset(client, chairType, name)
          const assignmentId = await assign(client, asset.supplyId, employeeId, {
            status: shipping ? 'shipping' : 'active',
          })
          if (shipping) chairShippingAssignment = assignmentId
          else {
            chairRetiredAssignment = assignmentId
            await retire(assignmentId)
          }
        }
      }

      if (reverse) {
        await insertChair(true)
        await insertComputing(true)
      } else {
        await insertComputing(false)
        await insertChair(false)
      }

      const body = await matrixBody(client, employeeId)
      // Cómputo cubierto por los DOS activos abiertos, sin importar cuál se creó primero.
      assert.containsSubset(categoryOf(body, 'computing_equipment'), {
        status: 'delivered',
        assets: [
          { employeeSupplyId: laptopAssignment, assignmentStatus: 'shipping' },
          { employeeSupplyId: monitorAssignment, assignmentStatus: 'active' },
        ],
      })
      // Silla: solo la que va en envío cubre; la devuelta no aparece.
      const chair = categoryOf(body, 'ergonomic_chair')
      assert.containsSubset(chair, {
        status: 'shipping',
        assets: [{ employeeSupplyId: chairShippingAssignment, assignmentStatus: 'shipping' }],
      })
      assert.lengthOf(chair.assets, 1)
      assert.isFalse(chair.assets.some((asset) => asset.employeeSupplyId === chairRetiredAssignment))
    }

    await scenario('ca2-forward', false)
    await scenario('ca2-reverse', true)
  })

  test('CA-3: lo devuelto no cubre; uncoveredCount cuenta solo silla y cómputo', async ({
    client,
    assert,
  }) => {
    const employeeId = await makeEmployee('ca3', 'Remote', 100)
    const computingType = await makeType(client, 'Cómputo', 'computing_equipment')
    const accessoryType = await makeType(client, 'Aditamento', 'accessory')
    const laptop = await makeAsset(client, computingType, 'Laptop')
    await retire(await assign(client, laptop.supplyId, employeeId))
    const support = await makeAsset(client, accessoryType, 'Soporte')
    await retire(await assign(client, support.supplyId, employeeId))

    const body = await matrixBody(client, employeeId)

    assert.containsSubset(body, {
      applies: true,
      categories: [
        { category: 'ergonomic_chair', status: 'uncovered' },
        { category: 'computing_equipment', status: 'uncovered' },
        { category: 'accessory', status: 'not_delivered' },
      ],
      teleworkSuppliesSummary: {
        deliveredCount: 0,
        shippingCount: 0,
        ownEquipmentCount: 0,
        uncoveredCount: 2,
        unsignedCustodyCount: 0,
      },
    })
    assert.isEmpty(categoryOf(body, 'computing_equipment').assets)
    assert.isEmpty(categoryOf(body, 'accessory').assets)
  })

  test('CA-4: el umbral es inclusivo (R4)', async ({ client, assert }) => {
    const belowThreshold = await makeEmployee('ca4-below', 'Hybrid', 39.99)
    const atThreshold = await makeEmployee('ca4-at', 'Hybrid', 40)

    const below = await matrixBody(client, belowThreshold)
    assert.isTrue(below.applies)
    assert.isFalse(below.isLegallyRequired)

    const at = await matrixBody(client, atThreshold)
    assert.isTrue(at.applies)
    assert.isTrue(at.isLegallyRequired)
  })

  test('CA-5: presencial, baja y porcentaje residual no aplican', async ({ client, assert }) => {
    const onsite = await makeEmployee('ca5-onsite', 'Onsite', 0)
    const deleted = await makeEmployee('ca5-deleted', 'Remote', 100)
    await db.from('employees').where('employee_id', deleted).update({ employee_deleted_at: new Date() })
    const residual = await makeEmployee('ca5-residual', 'Onsite', 50)

    for (const employeeId of [onsite, deleted, residual]) {
      const body = await matrixBody(client, employeeId)
      assert.isFalse(body.applies, `colaborador ${employeeId}`)
      assert.isFalse(body.isLegallyRequired, `colaborador ${employeeId}`)
      assert.isEmpty(body.categories, `colaborador ${employeeId}`)
      assert.containsSubset(body.teleworkSuppliesSummary, EMPTY_SUMMARY, `colaborador ${employeeId}`)
    }
  })

  test('CA-6: unsignedCustodyCount cuenta solo entregados sin contrato', async ({
    client,
    assert,
  }) => {
    const employeeId = await makeEmployee('ca6', 'Remote', 100)
    const chairType = await makeType(client, 'Silla', 'ergonomic_chair')
    const computingType = await makeType(client, 'Cómputo', 'computing_equipment')
    const phoneType = await makeType(client, 'Celular') // sin categoría: no entra a la matriz
    const chair = await makeAsset(client, chairType, 'Silla ergonómica')
    const chairAssignment = await assign(client, chair.supplyId, employeeId)
    const laptop = await makeAsset(client, computingType, 'Laptop')
    await assign(client, laptop.supplyId, employeeId, { status: 'shipping' })
    const phone = await makeAsset(client, phoneType, 'Celular')
    await assign(client, phone.supplyId, employeeId)

    const body = await matrixBody(client, employeeId)

    assert.containsSubset(body.teleworkSuppliesSummary, {
      deliveredCount: 1,
      shippingCount: 1,
      ownEquipmentCount: 0,
      uncoveredCount: 0,
      unsignedCustodyCount: 1,
    })
    assert.containsSubset(categoryOf(body, 'ergonomic_chair'), {
      status: 'delivered',
      assets: [{ employeeSupplyId: chairAssignment, custodyStatus: 'unsigned' }],
    })
  })

  test('CA-7: reclasificar el tipo se refleja en la siguiente consulta (R2)', async ({
    client,
    assert,
  }) => {
    const employeeId = await makeEmployee('ca7', 'Remote', 100)
    const chairType = await makeType(client, 'Silla', 'ergonomic_chair')
    const chair = await makeAsset(client, chairType, 'Silla ergonómica')
    const assignmentId = await assign(client, chair.supplyId, employeeId)
    await signContract(assignmentId)

    const before = await matrixBody(client, employeeId)
    assert.containsSubset(categoryOf(before, 'ergonomic_chair'), {
      status: 'delivered',
      assets: [{ employeeSupplyId: assignmentId }],
    })

    await db
      .from('supply_types')
      .where('supply_type_id', chairType)
      .update({ supply_type_telework_category: null })

    const after = await matrixBody(client, employeeId)
    assert.equal(categoryOf(after, 'ergonomic_chair').status, 'uncovered')
    assert.isEmpty(categoryOf(after, 'ergonomic_chair').assets)
    assert.equal(categoryOf(after, 'computing_equipment').status, 'uncovered')
    assert.equal(categoryOf(after, 'accessory').status, 'not_delivered')
    assert.containsSubset(after.teleworkSuppliesSummary, { deliveredCount: 0, uncoveredCount: 2 })
  })

  test('CA-8: otra empresa e inexistente responden el mismo 404; id no numérico 422', async ({
    client,
    assert,
  }) => {
    const actor = required(actorA, 'el actor A')
    const foreignEmployeeId = required(employeeB, 'el colaborador de B').employee.employeeId
    // Cuerpo de error completo, comparado exacto serializando (CA-14).
    const expected = {
      type: 'error',
      title: 'Colaborador no encontrado',
      message: 'El colaborador no existe o no pertenece a la empresa.',
      detail: 'El colaborador no existe o no pertenece a la empresa.',
      key: ASSET_ERROR_KEYS.EMPLOYEE_NOT_FOUND,
      data: null,
    }

    for (const id of [foreignEmployeeId, 999999999]) {
      const response = await client
        .get(`/api/employees/${id}/telework-supplies`)
        .loginAs(actor.user)
        .headers(businessUnitHeaders(actor))
      response.assertStatus(404)
      assert.equal(JSON.stringify(response.body()), JSON.stringify(expected), `id ${id}`)
    }

    for (const id of ['abc', '0']) {
      const response = await client
        .get(`/api/employees/${id}/telework-supplies`)
        .loginAs(actor.user)
        .headers(businessUnitHeaders(actor))
      response.assertStatus(422)
      assert.equal(response.body().key, ASSET_ERROR_KEYS.INVALID_INPUT, id)
    }
  })

  test('RF-1: un resguardo borrado lógicamente no firma', async ({ client, assert }) => {
    const employeeId = await makeEmployee('rf1', 'Remote', 100)
    const chairType = await makeType(client, 'Silla', 'ergonomic_chair')
    const chair = await makeAsset(client, chairType, 'Silla ergonómica')
    const assignmentId = await assign(client, chair.supplyId, employeeId)
    await signContract(assignmentId, true)

    const body = await matrixBody(client, employeeId)

    assert.containsSubset(categoryOf(body, 'ergonomic_chair'), {
      status: 'delivered',
      assets: [{ employeeSupplyId: assignmentId, custodyStatus: 'unsigned' }],
    })
    assert.containsSubset(body.teleworkSuppliesSummary, { deliveredCount: 1, unsignedCustodyCount: 1 })
  })

  test('RF-2: sin fecha de asignación, assignedAt es la de alta', async ({ client, assert }) => {
    const employeeId = await makeEmployee('rf2', 'Remote', 100)
    const chairType = await makeType(client, 'Silla', 'ergonomic_chair')
    const chair = await makeAsset(client, chairType, 'Silla ergonómica')
    const assignmentId = await assign(client, chair.supplyId, employeeId, { date: '2026-08-01' })
    await db
      .from('employee_supplies')
      .where('employee_supply_id', assignmentId)
      .update({ employee_supply_assignament_date: null })

    const row: { assigned_at: string } | undefined = await db
      .from('employee_supplies')
      .where('employee_supply_id', assignmentId)
      .select(db.raw("DATE_FORMAT(employee_supply_created_at, '%Y-%m-%d') as assigned_at"))
      .first()

    const body = await matrixBody(client, employeeId)
    const asset = categoryOf(body, 'ergonomic_chair').assets[0]
    assert.equal(asset.assignedAt, required(row, 'la fecha de alta').assigned_at)
  })
})
