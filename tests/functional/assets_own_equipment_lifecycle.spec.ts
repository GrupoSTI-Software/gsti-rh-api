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
  assertPermissionDenied,
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
  let readerActor: TenantActor | null = null
  let employeeA: EmployeeFixture | null = null
  let employeeB: EmployeeFixture | null = null
  let previousEmployeesEnforcement = false

  const createdDeclarationIds: number[] = []
  const settingsBusinessUnitIds: number[] = []
  const createdSupplyTypeIds: number[] = []
  const createdSupplyIds: number[] = []
  const createdEmployeeSupplyIds: number[] = []
  let fixtureSeq = 0

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
    // Actor lector (CA-16): `supplies:read` en el módulo supplies, SIN el permiso
    // de escritura de Empleados. Prueba que el gate del ajuste es por permiso y
    // no por módulo, y lee la matriz sobre su propio colaborador (Tarea 6).
    readerActor = await createTenantActor('equipo-propio-vida-http-lector')
    await grantModulePermissions(readerActor, 'supplies', ['read'])

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
    if (createdEmployeeSupplyIds.length > 0) {
      await db
        .from('employee_supplies')
        .whereIn('employee_supply_id', createdEmployeeSupplyIds)
        .delete()
      createdEmployeeSupplyIds.length = 0
    }
    if (createdSupplyIds.length > 0) {
      await db.from('supplies').whereIn('supply_id', createdSupplyIds).delete()
      createdSupplyIds.length = 0
    }
    if (createdSupplyTypeIds.length > 0) {
      await db.from('supply_types').whereIn('supply_type_id', createdSupplyTypeIds).delete()
      createdSupplyTypeIds.length = 0
    }
  })

  group.teardown(async () => {
    await cleanupEmployeeFixture(employeeB)
    await cleanupEmployeeFixture(employeeA)
    await cleanupTenantActor(readerActor)
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

  // ── Parte 3: el ajuste versionado por HTTP
  //    (CA-5 a CA-8, CA-10, CA-11, CA-16 y los Review Focus 1/2). Reutiliza los
  //    actores, la vigente del alta y `upsertTeleworkSettings` de la parte 2. ───

  /** PUT del ajuste como el usuario dado, con la empresa indicada en la cabecera. */
  function putAs(
    client: ApiClient,
    user: User,
    buPublicId: string,
    declarationId: number,
    payload: Record<string, unknown>
  ) {
    return client
      .put(`/api/own-equipment-declarations/${declarationId}`)
      .loginAs(user)
      .headers({ 'X-Business-Unit-Id': buPublicId })
      .json(payload)
  }

  const putAsA = (client: ApiClient, declarationId: number, payload: Record<string, unknown>) =>
    putAs(client, actorAUser(), buPublicIdA(), declarationId, payload)

  const buIdB = () => required(actorB, 'el actor B').businessUnit.businessUnitId

  /** Columnas que el caso puede variar sobre la fila mínima del ajuste. */
  interface Part3DeclarationOverrides {
    category?: OwnEquipmentCategory
    employeeId?: number
    businessUnitId?: number
    status?: 'active' | 'closed'
    startDate?: string
    endDate?: string | null
    monthlyFee?: number
    description?: string
    conditions?: string | null
    file?: string | null
    deletedAt?: Date | null
  }

  /**
   * Inserta una declaración por tabla. El caso la usa cuando necesita la fila
   * cerrada de antemano, con la evidencia ya puesta, con un origen `adjusted`
   * desde el arranque o colgada de otra empresa (el aislamiento de CA-11).
   */
  async function insertDeclaration(overrides: Part3DeclarationOverrides = {}): Promise<number> {
    const [declarationId] = await db.table('employee_own_equipment_declarations').insert({
      employee_id: overrides.employeeId ?? employeeIdA(),
      business_unit_id: overrides.businessUnitId ?? buIdA(),
      employee_own_equipment_declaration_category: overrides.category ?? 'ergonomic_chair',
      employee_own_equipment_declaration_description:
        overrides.description ?? `Equipo propio ciclo ${RUN}`,
      employee_own_equipment_declaration_conditions: overrides.conditions ?? null,
      employee_own_equipment_declaration_start_date: overrides.startDate ?? '2026-09-01',
      employee_own_equipment_declaration_end_date: overrides.endDate ?? null,
      employee_own_equipment_declaration_monthly_fee: overrides.monthlyFee ?? 350,
      employee_own_equipment_declaration_fee_source: 'adjusted',
      employee_own_equipment_declaration_file: overrides.file ?? null,
      employee_own_equipment_declaration_status: overrides.status ?? 'active',
      employee_own_equipment_declaration_created_by_user_id: actorAUser().userId,
      employee_own_equipment_declaration_created_at: new Date(),
      employee_own_equipment_declaration_deleted_at: overrides.deletedAt ?? null,
    })

    const id = Number(declarationId)
    createdDeclarationIds.push(id)
    return id
  }

  /** Fila cruda de la declaración para las aserciones de la parte 3. */
  interface Part3DeclarationRow {
    employee_id: number
    business_unit_id: number
    employee_own_equipment_declaration_category: string
    employee_own_equipment_declaration_description: string
    employee_own_equipment_declaration_conditions: string | null
    employee_own_equipment_declaration_start_date: string
    employee_own_equipment_declaration_end_date: string | null
    employee_own_equipment_declaration_monthly_fee: string
    employee_own_equipment_declaration_fee_source: string
    employee_own_equipment_declaration_file: string | null
    employee_own_equipment_declaration_status: string
    employee_own_equipment_declaration_closed_reason: string | null
    employee_own_equipment_declaration_created_by_user_id: number
    employee_own_equipment_declaration_closed_by_user_id: number | null
  }

  async function declarationRow(id: number): Promise<Part3DeclarationRow> {
    // Las columnas `DATE` de este query builder llegan como `Date`; se formatean
    // a `YYYY-MM-DD` como lo hace el puerto (`DATE_FORMAT`).
    return db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', id)
      .select(
        'employee_id',
        'business_unit_id',
        'employee_own_equipment_declaration_category',
        'employee_own_equipment_declaration_description',
        'employee_own_equipment_declaration_conditions',
        db.raw(
          "DATE_FORMAT(employee_own_equipment_declaration_start_date, '%Y-%m-%d') as employee_own_equipment_declaration_start_date"
        ),
        db.raw(
          "DATE_FORMAT(employee_own_equipment_declaration_end_date, '%Y-%m-%d') as employee_own_equipment_declaration_end_date"
        ),
        'employee_own_equipment_declaration_monthly_fee',
        'employee_own_equipment_declaration_fee_source',
        'employee_own_equipment_declaration_file',
        'employee_own_equipment_declaration_status',
        'employee_own_equipment_declaration_closed_reason',
        'employee_own_equipment_declaration_created_by_user_id',
        'employee_own_equipment_declaration_closed_by_user_id'
      )
      .firstOrFail()
  }

  /**
   * Insumo de teletrabajo con su tipo y resguardo, por tabla: lo que necesita
   * CA-8 para cubrir una categoría con un activo abierto (en envío).
   */
  async function createTeleworkSupply(
    overrides: { category?: OwnEquipmentCategory; status?: 'active' | 'shipping' } = {}
  ): Promise<{ employeeSupplyId: number; supplyId: number }> {
    fixtureSeq += 1
    const businessUnit = buIdA()

    const [typeId] = await db.table('supply_types').insert({
      business_unit_id: businessUnit,
      supply_type_name: `Insumo ciclo ${RUN}-${fixtureSeq}`,
      supply_type_slug: `insumo-ciclo-${RUN}-${fixtureSeq}`,
      supply_type_telework_category: overrides.category ?? 'ergonomic_chair',
      supply_type_created_at: new Date(),
    })
    createdSupplyTypeIds.push(Number(typeId))

    const [supplyId] = await db.table('supplies').insert({
      business_unit_id: businessUnit,
      supply_file_number: 1_000_000_000 + (Date.now() % 500_000_000) + fixtureSeq,
      supply_name: `Activo ciclo ${fixtureSeq}`,
      supply_type_id: Number(typeId),
      supply_status: 'active',
      supply_created_at: new Date(),
    })
    createdSupplyIds.push(Number(supplyId))

    const [employeeSupplyId] = await db.table('employee_supplies').insert({
      employee_id: employeeIdA(),
      supply_id: Number(supplyId),
      business_unit_id: businessUnit,
      employee_supply_status: overrides.status ?? 'active',
      employee_supply_assignament_date: '2026-08-01 00:00:00',
      employee_supply_created_at: new Date(),
    })
    createdEmployeeSupplyIds.push(Number(employeeSupplyId))

    return { employeeSupplyId: Number(employeeSupplyId), supplyId: Number(supplyId) }
  }

  /** Alta de la vigente de silla del colaborador A, con su id. */
  async function createOpenChair(client: ApiClient): Promise<number> {
    const created = await postAsA(client, employeeIdA(), { ...BASE_PAYLOAD })
    created.assertStatus(201)
    const declarationId = created.body().data.declarationId
    createdDeclarationIds.push(declarationId)
    return declarationId
  }

  test('CA-5: el ajuste cierra la vigente y abre la nueva en un solo paso', async ({
    client,
    assert,
  }) => {
    await upsertTeleworkSettings(buIdA(), 350)
    const oldId = await createOpenChair(client)

    // La evidencia de la versión vieja (la hermana C): no debe moverse.
    await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', oldId)
      .update({ employee_own_equipment_declaration_file: 'evidencia.png' })

    const response = await putAsA(client, oldId, { monthlyFee: 420, effectiveDate: '2026-10-15' })
    response.assertStatus(200)

    const body = response.body()
    assert.equal(body.type, 'success')
    assert.equal(body.title, 'Declaración de equipo propio')
    assert.equal(body.message, 'Declaración de equipo propio ajustada')

    const newId = body.data.declarationId
    createdDeclarationIds.push(newId)
    assert.notEqual(newId, oldId)
    assert.equal(body.data.employeeId, employeeIdA())
    assert.equal(body.data.category, 'ergonomic_chair')
    assert.equal(body.data.description, BASE_PAYLOAD.description)
    assert.equal(body.data.conditions, BASE_PAYLOAD.conditions)
    assert.equal(body.data.startDate, '2026-10-15')
    assert.equal(body.data.monthlyFee, 420)
    assert.equal(body.data.feeSource, 'adjusted')
    assert.equal(body.data.status, 'active')

    // La versión nueva: clona la vieja, nace sin archivo y con la autoría del actor.
    const fresh = await declarationRow(newId)
    assert.equal(fresh.employee_id, employeeIdA())
    assert.equal(fresh.business_unit_id, buIdA())
    assert.equal(fresh.employee_own_equipment_declaration_category, 'ergonomic_chair')
    assert.equal(fresh.employee_own_equipment_declaration_description, BASE_PAYLOAD.description)
    assert.equal(fresh.employee_own_equipment_declaration_conditions, BASE_PAYLOAD.conditions)
    assert.equal(fresh.employee_own_equipment_declaration_start_date, '2026-10-15')
    assert.equal(Number(fresh.employee_own_equipment_declaration_monthly_fee), 420)
    assert.equal(fresh.employee_own_equipment_declaration_fee_source, 'adjusted')
    assert.equal(fresh.employee_own_equipment_declaration_status, 'active')
    assert.isNull(fresh.employee_own_equipment_declaration_file)
    assert.equal(fresh.employee_own_equipment_declaration_created_by_user_id, actorAUser().userId)

    // La vieja: cerrada el día civil anterior, por `adjusted`, con autor, y su
    // evidencia intacta.
    const closed = await declarationRow(oldId)
    assert.equal(closed.employee_own_equipment_declaration_status, 'closed')
    assert.equal(closed.employee_own_equipment_declaration_end_date, '2026-10-14')
    assert.equal(closed.employee_own_equipment_declaration_closed_reason, 'adjusted')
    assert.equal(closed.employee_own_equipment_declaration_closed_by_user_id, actorAUser().userId)
    assert.equal(closed.employee_own_equipment_declaration_file, 'evidencia.png')

    assert.equal(await activeDeclarationCount(employeeIdA(), 'ergonomic_chair'), 1)
  })

  test('CA-6: la vigencia debe ser posterior al inicio; el día siguiente es válido', async ({
    client,
    assert,
  }) => {
    await upsertTeleworkSettings(buIdA(), 350)
    const oldId = await createOpenChair(client)

    // El día siguiente al inicio de la vigente es válido.
    const next = await putAsA(client, oldId, { monthlyFee: 420, effectiveDate: '2026-09-02' })
    next.assertStatus(200)
    const newId = next.body().data.declarationId
    createdDeclarationIds.push(newId)

    const closedOld = await declarationRow(oldId)
    assert.equal(closedOld.employee_own_equipment_declaration_end_date, '2026-09-01')

    // Anterior al inicio: 422 de fecha (el chequeo va ANTES que el de cambios;
    // la cuota es requerida y válida, así que no interfiere).
    const beforeStart = await putAsA(client, newId, {
      monthlyFee: 420,
      effectiveDate: '2026-09-01',
    })
    beforeStart.assertStatus(422)
    assert.equal(beforeStart.body().key, 'entrada-invalida')
    assert.equal(
      beforeStart.body().detail,
      'La fecha de vigencia debe ser posterior al inicio de la declaración vigente'
    )

    const before = await putAsA(client, newId, {
      monthlyFee: 420,
      effectiveDate: '2026-08-31',
    })
    before.assertStatus(422)
    assert.equal(before.body().key, 'entrada-invalida')
    assert.equal(
      before.body().detail,
      'La fecha de vigencia debe ser posterior al inicio de la declaración vigente'
    )

    assert.equal(await activeDeclarationCount(employeeIdA(), 'ergonomic_chair'), 1)
    const afterRejects = await declarationRow(newId)
    assert.equal(afterRejects.employee_own_equipment_declaration_status, 'active')
  })

  test('CA-6b: un PUT sin la cuota responde 422 cuota-de-equipo-propio-invalida', async ({
    client,
    assert,
  }) => {
    await upsertTeleworkSettings(buIdA(), 350)
    const oldId = await createOpenChair(client)

    // La cuota es REQUERIDA en el ajuste (spec §11): se parsea justo tras el
    // alcance y ANTES del pre-chequeo, así que un cuerpo sin `monthlyFee`
    // responde 422 de cuota sin llegar a evaluar la fecha ni los cambios.
    const response = await putAsA(client, oldId, { effectiveDate: '2026-10-15' })
    response.assertStatus(422)
    assert.equal(response.body().key, 'cuota-de-equipo-propio-invalida')

    // La vigente no cambia y no nace una versión nueva.
    assert.equal(await activeDeclarationCount(employeeIdA(), 'ergonomic_chair'), 1)
    const unchanged = await declarationRow(oldId)
    assert.equal(unchanged.employee_own_equipment_declaration_status, 'active')
    assert.isNull(unchanged.employee_own_equipment_declaration_end_date)
  })

  test('CA-7: el ajuste sin cambios se rechaza y no nace una versión', async ({
    client,
    assert,
  }) => {
    await upsertTeleworkSettings(buIdA(), 350)
    const oldId = await createOpenChair(client)

    const response = await putAsA(client, oldId, {
      monthlyFee: 350,
      description: BASE_PAYLOAD.description,
    })
    response.assertStatus(422)
    assert.equal(response.body().key, 'entrada-invalida')
    assert.equal(
      response.body().detail,
      'El ajuste no cambia nada: cuota, descripción o condiciones deben diferir de la versión vigente'
    )

    assert.equal(await activeDeclarationCount(employeeIdA(), 'ergonomic_chair'), 1)
    const unchanged = await declarationRow(oldId)
    assert.equal(unchanged.employee_own_equipment_declaration_status, 'active')
  })

  test('Review Focus 1: conditions null limpia y es un cambio válido', async ({
    client,
    assert,
  }) => {
    await upsertTeleworkSettings(buIdA(), 350)
    const oldId = await createOpenChair(client)

    const response = await putAsA(client, oldId, { monthlyFee: 350, conditions: null })
    response.assertStatus(200)
    const newId = response.body().data.declarationId
    createdDeclarationIds.push(newId)

    const cleared = await declarationRow(newId)
    assert.isNull(cleared.employee_own_equipment_declaration_conditions)
    // La vieja conserva sus condiciones.
    const previous = await declarationRow(oldId)
    assert.equal(previous.employee_own_equipment_declaration_conditions, BASE_PAYLOAD.conditions)
  })

  test('Review Focus 2: ajustar al monto de la estándar recalcula el origen a default', async ({
    client,
    assert,
  }) => {
    await upsertTeleworkSettings(buIdA(), 350)

    // La vigente nace con el origen capturado (`adjusted`), no con la estándar:
    // el ajuste a 350 debe recalcularlo a `default`.
    const oldId = await insertDeclaration({ monthlyFee: 350, description: 'Silla propia' })

    const response = await putAsA(client, oldId, { monthlyFee: 350, description: 'otra' })
    response.assertStatus(200)
    const newId = response.body().data.declarationId
    createdDeclarationIds.push(newId)

    assert.equal(response.body().data.feeSource, 'default')
    const fresh = await declarationRow(newId)
    assert.equal(fresh.employee_own_equipment_declaration_fee_source, 'default')
    assert.equal(Number(fresh.employee_own_equipment_declaration_monthly_fee), 350)
  })

  test('CA-8: ajustar una categoría cubierta por un activo se rechaza', async ({
    client,
    assert,
  }) => {
    await upsertTeleworkSettings(buIdA(), 350)
    const oldId = await insertDeclaration({ category: 'ergonomic_chair' })

    // Resguardo en envío de la misma categoría: la cubre (R6).
    await createTeleworkSupply({ category: 'ergonomic_chair', status: 'shipping' })

    const response = await putAsA(client, oldId, { monthlyFee: 420, effectiveDate: '2026-10-15' })
    response.assertStatus(409)
    assert.equal(response.body().key, 'categoria-cubierta-por-activo')

    assert.equal(await activeDeclarationCount(employeeIdA(), 'ergonomic_chair'), 1)
    const stillActive = await declarationRow(oldId)
    assert.equal(stillActive.employee_own_equipment_declaration_status, 'active')
  })

  test('CA-10: sobre una cerrada, 409 sin efecto; dos PUT concurrentes dejan una sola versión', async ({
    client,
    assert,
  }) => {
    // Cerrada de antemano: el ajuste no procede.
    const closedId = await insertDeclaration({
      category: 'ergonomic_chair',
      status: 'closed',
      endDate: '2026-09-30',
    })

    const overClosed = await putAsA(client, closedId, {
      monthlyFee: 420,
      effectiveDate: '2026-10-15',
    })
    overClosed.assertStatus(409)
    assert.equal(overClosed.body().key, 'declaracion-de-equipo-propio-no-vigente')
    assert.equal(await activeDeclarationCount(employeeIdA(), 'ergonomic_chair'), 0)

    // Vigente para el par concurrente: el candado del colaborador serializa y
    // deja una sola versión nueva.
    const activeId = await insertDeclaration({ category: 'ergonomic_chair' })
    const payload = { monthlyFee: 420, effectiveDate: '2026-10-15' }
    const [first, second] = await Promise.all([
      putAsA(client, activeId, payload),
      putAsA(client, activeId, payload),
    ])

    const statuses = [first.status(), second.status()].sort((a, b) => a - b)
    assert.deepEqual(statuses, [200, 409])

    const conflict = first.status() === 409 ? first : second
    assert.include(
      ['declaracion-de-equipo-propio-no-vigente', 'declaracion-de-equipo-propio-vigente-existente'],
      conflict.body().key
    )

    const created = first.status() === 200 ? first : second
    createdDeclarationIds.push(created.body().data.declarationId)

    assert.equal(await activeDeclarationCount(employeeIdA(), 'ergonomic_chair'), 1)
  })

  test('CA-11: ajena, inexistente y borrada responden el mismo 404', async ({
    client,
    assert,
  }) => {
    const foreignId = await insertDeclaration({
      employeeId: employeeIdB(),
      businessUnitId: buIdB(),
    })
    const deletedId = await insertDeclaration({ category: 'computing_equipment', deletedAt: new Date() })

    const payload = { monthlyFee: 420, effectiveDate: '2026-10-15' }
    const foreign = await putAsA(client, foreignId, payload)
    const missing = await putAsA(client, 2_000_000_000, payload)
    const deleted = await putAsA(client, deletedId, payload)

    for (const response of [foreign, missing, deleted]) response.assertStatus(404)

    const expected = {
      type: 'error',
      title: 'Declaración de equipo propio no encontrada',
      message: 'La declaración no existe o no pertenece a la empresa.',
      detail: 'La declaración no existe o no pertenece a la empresa.',
      key: 'declaracion-de-equipo-propio-no-encontrada',
      data: null,
    }
    assert.deepEqual(foreign.body(), expected)
    assert.deepEqual(missing.body(), expected)
    assert.deepEqual(deleted.body(), expected)
  })

  test('RF: el ajuste con el colaborador dado de baja responde 404 colaborador-no-encontrado', async ({
    client,
    assert,
  }) => {
    const oldId = await insertDeclaration({ category: 'ergonomic_chair' })

    // Baja lógica temporal del colaborador A: se restaura al terminar el caso.
    await db
      .from('employees')
      .where('employee_id', employeeIdA())
      .update({ employee_deleted_at: new Date() })
    const response = await putAsA(client, oldId, { monthlyFee: 420, effectiveDate: '2026-10-15' })
    await db
      .from('employees')
      .where('employee_id', employeeIdA())
      .update({ employee_deleted_at: null })

    response.assertStatus(404)
    assert.equal(response.body().key, 'colaborador-no-encontrado')

    assert.equal(await activeDeclarationCount(employeeIdA(), 'ergonomic_chair'), 1)
    const stillOpen = await declarationRow(oldId)
    assert.equal(stillOpen.employee_own_equipment_declaration_status, 'active')
    assert.isNull(stillOpen.employee_own_equipment_declaration_end_date)
  })

  test('CA-16: sin manage-employee-supplies el gate responde 403', async ({ client, assert }) => {
    const reader = required(readerActor, 'el actor lector')

    // `supplies:read` no abre el gate de Empleados: el 403 corre antes del
    // handler (no hace falta un `:declarationId` válido).
    const denied = await putAs(client, reader.user, reader.businessUnit.businessUnitPublicId, 2_000_000_000, {
      monthlyFee: 420,
      effectiveDate: '2026-10-15',
    })
    assertPermissionDenied(assert, denied)

    assert.equal(await activeDeclarationCount(employeeIdA(), 'ergonomic_chair'), 0)
  })
})
