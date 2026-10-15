import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import type User from '#models/user'
import OwnEquipmentDeclarationsRepositoryMysql from '#modules/assets/own_equipment_declarations.repository.mysql'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'
import {
  assertModuleEnforced,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  required,
  setModuleEnforcement,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Ciclo de vida de la declaración de equipo propio (VLRH-H1791493045968).
 *
 * Parte 1 (el puerto, SIN HTTP): prueba los tres métodos que el ciclo de vida
 * agrega al puerto —la consulta de la fila viva para cambiarla (con su empresa
 * y su candado dentro de la transacción), el cierre con periodo, motivo y autor,
 * y el histórico ordenado por fin y luego por id. El alcance de empresas viaja
 * DENTRO de cada consulta (R3), de modo que ajeno, inexistente y borrado lógico
 * dan el mismo `null` indistinguible. Las partes siguientes (HTTP) se agregan
 * sobre este mismo archivo.
 */

const RUN = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

/** Las tres categorías de insumo de teletrabajo (orden de la norma). */
type OwnEquipmentCategory = 'ergonomic_chair' | 'computing_equipment' | 'accessory'

/** Columnas que el caso puede variar sobre la fila mínima del helper. */
interface DeclarationOverrides {
  category?: OwnEquipmentCategory
  /** Colaborador dueño de la fila; por defecto, el del grupo (A). */
  employeeId?: number
  businessUnitId?: number
  status?: 'active' | 'closed'
  endDate?: string | null
  /** Borrado lógico: deja la fila fuera del alcance aunque siga en la tabla. */
  deletedAt?: Date | null
  monthlyFee?: number
  startDate?: string
}

test.group('Ciclo de vida de la declaración de equipo propio — puerto (sin HTTP)', (group) => {
  let actor: TenantActor | null = null
  let actorB: TenantActor | null = null
  let employee: EmployeeFixture | null = null
  let employeeB: EmployeeFixture | null = null
  const createdDeclarationIds: number[] = []

  const repository = new OwnEquipmentDeclarationsRepositoryMysql()

  const actorUserId = () => required(actor, 'el actor').user.userId
  const employeeId = () => required(employee, 'el colaborador').employee.employeeId
  const businessUnitId = () => required(actor, 'el actor').businessUnit.businessUnitId
  const employeeIdB = () => required(employeeB, 'el colaborador de B').employee.employeeId
  const businessUnitIdB = () => required(actorB, 'el actor de B').businessUnit.businessUnitId

  /**
   * Inserta una declaración mínima por tabla, colgada del colaborador y la
   * empresa del fixture —por defecto los de A; el caso puede apuntar a B para
   * probar el aislamiento entre empresas. La empresa es SIEMPRE la del
   * colaborador; `created_by_user_id` es el usuario del actor.
   */
  async function insertDeclaration(overrides: DeclarationOverrides = {}): Promise<number> {
    const [declarationId] = await db.table('employee_own_equipment_declarations').insert({
      employee_id: overrides.employeeId ?? employeeId(),
      business_unit_id: overrides.businessUnitId ?? businessUnitId(),
      employee_own_equipment_declaration_category: overrides.category ?? 'ergonomic_chair',
      employee_own_equipment_declaration_description: `Equipo propio ${RUN}`,
      employee_own_equipment_declaration_start_date: overrides.startDate ?? '2026-11-01',
      employee_own_equipment_declaration_end_date: overrides.endDate ?? null,
      employee_own_equipment_declaration_monthly_fee: overrides.monthlyFee ?? 350,
      employee_own_equipment_declaration_fee_source: 'adjusted',
      employee_own_equipment_declaration_status: overrides.status ?? 'active',
      employee_own_equipment_declaration_created_by_user_id: actorUserId(),
      employee_own_equipment_declaration_deleted_at: overrides.deletedAt ?? null,
      employee_own_equipment_declaration_created_at: new Date(),
    })

    const id = Number(declarationId)
    createdDeclarationIds.push(id)
    return id
  }

  group.setup(async () => {
    actor = await createTenantActor('equipo-propio-ciclo')
    actorB = await createTenantActor('equipo-propio-ciclo-b')
    employee = await createEmployeeFixture(
      actor.businessUnit.businessUnitId,
      `emp-${RUN.slice(-6)}`
    )
    employeeB = await createEmployeeFixture(
      actorB.businessUnit.businessUnitId,
      `empb-${RUN.slice(-6)}`
    )
  })

  group.each.teardown(async () => {
    if (createdDeclarationIds.length > 0) {
      await db
        .from('employee_own_equipment_declarations')
        .whereIn('employee_own_equipment_declaration_id', createdDeclarationIds)
        .delete()
      createdDeclarationIds.length = 0
    }
  })

  group.teardown(async () => {
    await cleanupEmployeeFixture(employeeB)
    await cleanupEmployeeFixture(employee)
    await cleanupTenantActor(actorB)
    await cleanupTenantActor(actor)
  })

  test('RF: findDeclarationForChange devuelve la fila viva en alcance como ForChange', async ({
    assert,
  }) => {
    const id = await insertDeclaration({ category: 'ergonomic_chair', monthlyFee: 350 })

    const found = await repository.findDeclarationForChange(db, [businessUnitId()], id, {
      lock: false,
    })

    assert.deepEqual(found, {
      declarationId: id,
      employeeId: employeeId(),
      businessUnitId: businessUnitId(),
      category: 'ergonomic_chair',
      description: `Equipo propio ${RUN}`,
      conditions: null,
      startDate: '2026-11-01',
      monthlyFee: 350,
      status: 'active',
    })

    // Fila de B con el alcance de A → `null` (multi-tenant fail-closed, R3).
    const idB = await insertDeclaration({
      employeeId: employeeIdB(),
      businessUnitId: businessUnitIdB(),
    })
    assert.isNull(
      await repository.findDeclarationForChange(db, [businessUnitId()], idB, { lock: false })
    )

    // Id inexistente → el mismo `null`.
    assert.isNull(
      await repository.findDeclarationForChange(db, [businessUnitId()], 999_999_999, {
        lock: false,
      })
    )

    // Borrada lógicamente → el MISMO `null`, indistinguible.
    const deletedId = await insertDeclaration({
      category: 'computing_equipment',
      deletedAt: new Date(),
    })
    assert.isNull(
      await repository.findDeclarationForChange(db, [businessUnitId()], deletedId, { lock: false })
    )

    // Con candado dentro de una transacción devuelve la misma fila (forUpdate corre).
    const locked = await db.transaction((trx) =>
      repository.findDeclarationForChange(trx, [businessUnitId()], id, { lock: true })
    )
    assert.equal(locked?.declarationId, id)
  })

  test('RF: closeDeclaration cierra con periodo, motivo y autor', async ({ assert }) => {
    const id = await insertDeclaration({ category: 'ergonomic_chair' })

    const before: Record<string, unknown> = await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', id)
      .firstOrFail()

    await db.transaction((trx) =>
      repository.closeDeclaration(trx, id, {
        endDate: '2026-10-14',
        reason: 'telework_ended',
        userId: actorUserId(),
      })
    )

    const after: Record<string, unknown> = await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', id)
      .firstOrFail()

    assert.equal(after.employee_own_equipment_declaration_status, 'closed')
    assert.equal(after.employee_own_equipment_declaration_closed_reason, 'telework_ended')
    assert.equal(
      Number(after.employee_own_equipment_declaration_closed_by_user_id),
      actorUserId()
    )
    assert.isNotNull(after.employee_own_equipment_declaration_updated_at)

    // El resto de la fila queda intacto: el cierre solo escribe el periodo, el
    // motivo, el autor y la marca de actualización.
    assert.equal(
      after.employee_own_equipment_declaration_description,
      before.employee_own_equipment_declaration_description
    )
    assert.equal(
      after.employee_own_equipment_declaration_category,
      before.employee_own_equipment_declaration_category
    )
    assert.equal(
      after.employee_own_equipment_declaration_monthly_fee,
      before.employee_own_equipment_declaration_monthly_fee
    )
    assert.equal(
      after.employee_own_equipment_declaration_fee_source,
      before.employee_own_equipment_declaration_fee_source
    )

    // El `DATE` de fin llega civil (`YYYY-MM-DD`) a través del DTO del puerto.
    const dto = await repository.findById(db, [businessUnitId()], id)
    assert.equal(dto?.endDate, '2026-10-14')
    assert.equal(dto?.status, 'closed')
    assert.equal(dto?.closedReason, 'telework_ended')
  })

  test('RF: findHistoryByEmployee ordena por fin desc y luego id desc, y excluye vivas y borradas', async ({
    assert,
  }) => {
    const chairId = await insertDeclaration({
      category: 'ergonomic_chair',
      status: 'closed',
      endDate: '2026-09-30',
    })
    const computingId = await insertDeclaration({
      category: 'computing_equipment',
      status: 'closed',
      endDate: '2026-08-31',
    })
    const accessoryId = await insertDeclaration({
      category: 'accessory',
      status: 'closed',
      endDate: '2026-09-30',
    })

    // Una vigente NO aparece en el histórico.
    await insertDeclaration({ category: 'ergonomic_chair', status: 'active' })
    // Una cerrada borrada lógicamente NO aparece.
    await insertDeclaration({
      category: 'computing_equipment',
      status: 'closed',
      endDate: '2026-07-31',
      deletedAt: new Date(),
    })
    // Una cerrada de B, con el alcance de A, TAMPOCO aparece.
    await insertDeclaration({
      employeeId: employeeIdB(),
      businessUnitId: businessUnitIdB(),
      status: 'closed',
      endDate: '2026-09-30',
    })

    const history = await repository.findHistoryByEmployee([businessUnitId()], employeeId())

    // `end_date` desc; el empate del 2026-09-30 lo desempata `id` desc.
    assert.deepEqual(
      history.map((declaration) => declaration.declarationId),
      [accessoryId, chairId, computingId]
    )
    assert.isTrue(history.every((declaration) => declaration.status === 'closed'))

    // Alcance vacío → `[]` sin consultar.
    assert.deepEqual(await repository.findHistoryByEmployee([], employeeId()), [])
  })
})

/**
 * Ciclo de vida de la declaración de equipo propio (VLRH-H1791493045968).
 *
 * Parte 2 (CA-1 a CA-4, por HTTP): la precarga de la cuota del alta con la
 * estándar de la empresa y el origen (`feeSource`) que calcula el servidor. El
 * alta `POST /api/employees/:employeeId/own-equipment-declarations` espeja la
 * parte HTTP de `assets_own_equipment_declarations.spec.ts`: el actor A
 * administra su ficha con `employees:manage-employee-supplies` (módulo exigido
 * con `setModuleEnforcement`/`assertModuleEnforced`), la empresa viaja por
 * cabecera y la fila de ajustes se siembra por tabla y se limpia en el teardown.
 */
test.group('Ciclo de vida de la declaración de equipo propio — endpoint HTTP', (group) => {
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null
  let employeeA: EmployeeFixture | null = null
  let employeeB: EmployeeFixture | null = null
  let previousEmployeesEnforcement = false

  const createdDeclarationIds: number[] = []
  const settingsBusinessUnitIds: number[] = []

  const actorAUser = () => required(actorA, 'el actor A').user
  const actorBUser = () => required(actorB, 'el actor B').user
  const employeeIdA = () => required(employeeA, 'el colaborador A').employee.employeeId
  const employeeIdB = () => required(employeeB, 'el colaborador B').employee.employeeId
  const buIdA = () => required(actorA, 'el actor A').businessUnit.businessUnitId
  const buPublicIdA = () => required(actorA, 'el actor A').businessUnit.businessUnitPublicId
  const buPublicIdB = () => required(actorB, 'el actor B').businessUnit.businessUnitPublicId

  /**
   * Cuerpo mínimo válido del alta SIN cuota: la precarga toma la estándar de la
   * empresa. `businessUnitId`/`payrollBusinessUnitId` los inyecta el middleware
   * de scope, así que no se declaran aquí.
   */
  const BASE_PAYLOAD = {
    category: 'ergonomic_chair',
    description: 'Silla de oficina con respaldo ajustable',
    conditions: 'Buen estado; uso exclusivo para trabajo',
    startDate: '2026-09-01',
  }

  /** POST del alta como el usuario dado, con la empresa indicada en la cabecera. */
  function postAs(
    client: ApiClient,
    user: User,
    buPublicId: string,
    employeeId: number,
    payload: Record<string, unknown>
  ) {
    return client
      .post(`/api/employees/${employeeId}/own-equipment-declarations`)
      .loginAs(user)
      .headers({ 'X-Business-Unit-Id': buPublicId })
      .json(payload)
  }

  const postAsA = (client: ApiClient, employeeId: number, payload: Record<string, unknown>) =>
    postAs(client, actorAUser(), buPublicIdA(), employeeId, payload)

  const postAsB = (client: ApiClient, employeeId: number, payload: Record<string, unknown>) =>
    postAs(client, actorBUser(), buPublicIdB(), employeeId, payload)

  /** Declaraciones `active` y vivas del colaborador, opcionalmente por categoría. */
  async function activeDeclarationCount(
    employeeId: number,
    category?: OwnEquipmentCategory
  ): Promise<number> {
    const query = db
      .from('employee_own_equipment_declarations')
      .where('employee_id', employeeId)
      .where('employee_own_equipment_declaration_status', 'active')
      .whereNull('employee_own_equipment_declaration_deleted_at')
    if (category !== undefined) {
      query.where('employee_own_equipment_declaration_category', category)
    }
    const rows = await query
    return rows.length
  }

  /** Modalidad y porcentaje de teletrabajo del colaborador por tabla. */
  async function setTelework(employeeId: number, percentage: number): Promise<void> {
    await db
      .from('employees')
      .where('employee_id', employeeId)
      .update({ employee_telework_percentage: percentage, employee_work_schedule: 'Remote' })
  }

  /**
   * Siembra la fila de ajustes de la empresa del fixture (la empresa es nueva en
   * cada corrida: el UNIQUE de `business_unit_id` nunca choca) y la agenda para
   * el teardown del caso. `feeDefault` `null` = sin estándar.
   */
  async function upsertTeleworkSettings(
    businessUnitId: number,
    feeDefault: number | null
  ): Promise<void> {
    await db.table('telework_compliance_settings').insert({
      business_unit_id: businessUnitId,
      telework_compliance_setting_revalidation_period_months: 6,
      telework_compliance_setting_expiration_notice_days: 30,
      telework_compliance_setting_own_equipment_fee_default: feeDefault,
      telework_compliance_setting_created_by_user_id: actorAUser().userId,
      telework_compliance_setting_updated_by_user_id: actorAUser().userId,
      telework_compliance_setting_created_at: new Date(),
    })
    settingsBusinessUnitIds.push(businessUnitId)
  }

  /** Cierra por tabla la vigente de la categoría para liberar el UNIQUE del alta. */
  async function closeActiveByTable(
    employeeId: number,
    category: OwnEquipmentCategory
  ): Promise<void> {
    await db
      .from('employee_own_equipment_declarations')
      .where('employee_id', employeeId)
      .where('employee_own_equipment_declaration_category', category)
      .where('employee_own_equipment_declaration_status', 'active')
      .whereNull('employee_own_equipment_declaration_deleted_at')
      .update({
        employee_own_equipment_declaration_status: 'closed',
        employee_own_equipment_declaration_end_date: '2026-09-15',
      })
  }

  group.setup(async () => {
    // La exigencia del módulo `employees` nace apagada (estado de entrega):
    // se enciende solo para este grupo y se repone en el teardown.
    previousEmployeesEnforcement = await setModuleEnforcement('employees', true)
    await assertModuleEnforced('employees')

    actorA = await createTenantActor('equipo-propio-vida-http-a')
    await grantModulePermissions(actorA, 'employees', ['manage-employee-supplies'])
    actorB = await createTenantActor('equipo-propio-vida-http-b')
    await grantModulePermissions(actorB, 'employees', ['manage-employee-supplies'])

    employeeA = await createEmployeeFixture(
      actorA.businessUnit.businessUnitId,
      `empA-${RUN.slice(-6)}`
    )
    employeeB = await createEmployeeFixture(
      actorB.businessUnit.businessUnitId,
      `empB-${RUN.slice(-6)}`
    )
    await setTelework(employeeA.employee.employeeId, 100)
    await setTelework(employeeB.employee.employeeId, 100)
  })

  group.each.teardown(async () => {
    if (createdDeclarationIds.length > 0) {
      await db
        .from('employee_own_equipment_declarations')
        .whereIn('employee_own_equipment_declaration_id', createdDeclarationIds)
        .delete()
      createdDeclarationIds.length = 0
    }
    if (settingsBusinessUnitIds.length > 0) {
      await db
        .from('telework_compliance_settings')
        .whereIn('business_unit_id', settingsBusinessUnitIds)
        .delete()
      settingsBusinessUnitIds.length = 0
    }
  })

  group.teardown(async () => {
    await cleanupEmployeeFixture(employeeB)
    await cleanupEmployeeFixture(employeeA)
    await cleanupTenantActor(actorB)
    await cleanupTenantActor(actorA)
    await setModuleEnforcement('employees', previousEmployeesEnforcement)
  })

  test('CA-1: sin cuota capturada responde 201 con la estandar de la empresa', async ({
    client,
    assert,
  }) => {
    await upsertTeleworkSettings(buIdA(), 350)

    const response = await postAsA(client, employeeIdA(), { ...BASE_PAYLOAD })
    response.assertStatus(201)

    const data = response.body().data
    createdDeclarationIds.push(data.declarationId)
    assert.equal(data.monthlyFee, 350)
    assert.equal(data.feeSource, 'default')

    const stored: { fee_source: string; monthly_fee: string } = await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', data.declarationId)
      .select(
        'employee_own_equipment_declaration_fee_source as fee_source',
        'employee_own_equipment_declaration_monthly_fee as monthly_fee'
      )
      .firstOrFail()

    assert.equal(stored.fee_source, 'default')
    assert.equal(Number(stored.monthly_fee), 350)
  })

  test('CA-2: el origen se decide comparando centavos, no flotantes', async ({
    client,
    assert,
  }) => {
    await upsertTeleworkSettings(buIdA(), 0.3)

    const first = await postAsA(client, employeeIdA(), { ...BASE_PAYLOAD, monthlyFee: 0.3 })
    first.assertStatus(201)
    createdDeclarationIds.push(first.body().data.declarationId)
    assert.equal(first.body().data.feeSource, 'default')

    // Libera el UNIQUE de vigente para declarar de nuevo la misma categoría.
    await closeActiveByTable(employeeIdA(), 'ergonomic_chair')

    const second = await postAsA(client, employeeIdA(), { ...BASE_PAYLOAD, monthlyFee: 500 })
    second.assertStatus(201)
    createdDeclarationIds.push(second.body().data.declarationId)
    assert.equal(second.body().data.monthlyFee, 500)
    assert.equal(second.body().data.feeSource, 'adjusted')
  })

  test('CA-3: sin estandar la cuota es obligatoria y el cero se registra como ajustada', async ({
    client,
    assert,
  }) => {
    // El colaborador de B no tiene fila de ajustes: sin estándar.
    const missing = await postAsB(client, employeeIdB(), { ...BASE_PAYLOAD })
    missing.assertStatus(422)
    assert.equal(missing.body().key, 'cuota-de-equipo-propio-invalida')
    assert.equal(await activeDeclarationCount(employeeIdB(), 'ergonomic_chair'), 0)

    const zero = await postAsB(client, employeeIdB(), { ...BASE_PAYLOAD, monthlyFee: 0 })
    zero.assertStatus(201)
    createdDeclarationIds.push(zero.body().data.declarationId)
    assert.equal(zero.body().data.monthlyFee, 0)
    assert.equal(zero.body().data.feeSource, 'adjusted')
  })

  test('CA-4: el feeSource del body se ignora', async ({ client, assert }) => {
    const response = await postAsA(client, employeeIdA(), {
      ...BASE_PAYLOAD,
      monthlyFee: 500,
      feeSource: 'default',
    })
    response.assertStatus(201)
    createdDeclarationIds.push(response.body().data.declarationId)
    // Sin estándar en A y con una cuota capturada, el servidor decide `adjusted`.
    assert.equal(response.body().data.feeSource, 'adjusted')
  })
})
