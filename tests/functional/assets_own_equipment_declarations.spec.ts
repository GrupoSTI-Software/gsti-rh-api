import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import type User from '#models/user'
import { AssetError } from '#modules/assets/assets.error'
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
  cleanupUnitUser,
  createBypassUserInBusinessUnit,
  createTenantActor,
  grantModulePermissions,
  required,
  setModuleEnforcement,
  type TenantActor,
  type UnitUser,
} from '#tests/helpers/tenant_actor'

/**
 * Declaración del uso de equipo propio con su cuota (VLRH-H1791306075599).
 *
 * Parte 1 (CA-14): la tabla y sus invariantes de BD, SIN HTTP. Prueba lo único
 * que la migración garantiza por sí sola: la FK sin cascada conserva la
 * evidencia NOM-037 aunque se borre al colaborador en duro, y el UNIQUE sobre la
 * columna generada admite a lo sumo una declaración vigente por colaborador y
 * categoría: cerrar y el borrado lógico liberan el índice, y otra categoría del
 * mismo colaborador entra sin choque.
 *
 * Parte 1b: el puerto de lectura y escritura, también SIN HTTP. Prueba que el
 * alcance de empresas viaja DENTRO de cada consulta (R3), que la vigente por
 * lote no mezcla empresas ni consulta con listas vacías, que la cobertura abierta
 * exige resguardo y activo vivos de la categoría, y que el alta devuelve el DTO
 * (DECIMAL a número, DATE a `YYYY-MM-DD`, `created_at` a ISO). El ciclo de alta
 * por API y la matriz los agregan las tareas siguientes sobre este mismo archivo.
 */

const RUN = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

/** Las tres categorías de insumo de teletrabajo (orden de la norma). */
type OwnEquipmentCategory = 'ergonomic_chair' | 'computing_equipment' | 'accessory'

/** Estado del resguardo de un insumo que el caso necesita variar. */
type AssignmentStatus = 'active' | 'retired' | 'shipping'

/** Columnas que el caso puede variar sobre la fila mínima del helper. */
interface DeclarationOverrides {
  category?: OwnEquipmentCategory
  /** Colaborador dueño de la fila; por defecto, el del grupo (A). */
  employeeId?: number
  businessUnitId?: number
}

/** Variantes que el caso aplica sobre el insumo mínimo y su resguardo. */
interface TeleworkSupplyOverrides {
  category?: OwnEquipmentCategory
  status?: AssignmentStatus
  /** Borrado lógico del activo: deja la fila viva pero fuera de la cobertura. */
  supplyDeletedAt?: Date | null
}

test.group('Declaraciones de equipo propio — tabla (sin HTTP)', (group) => {
  let actor: TenantActor | null = null
  let actorB: TenantActor | null = null
  let employee: EmployeeFixture | null = null
  let employeeB: EmployeeFixture | null = null
  const createdDeclarationIds: number[] = []
  const createdSupplyTypeIds: number[] = []
  const createdSupplyIds: number[] = []
  const createdEmployeeSupplyIds: number[] = []
  let fixtureSeq = 0

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
   * colaborador, nunca otra; `created_by_user_id` es el usuario del actor. Las
   * columnas que solo escriben las historias siguientes van con sus valores por
   * defecto.
   */
  async function insertDeclaration(overrides: DeclarationOverrides = {}): Promise<number> {
    const [declarationId] = await db.table('employee_own_equipment_declarations').insert({
      employee_id: overrides.employeeId ?? employeeId(),
      business_unit_id: overrides.businessUnitId ?? businessUnitId(),
      employee_own_equipment_declaration_category: overrides.category ?? 'ergonomic_chair',
      employee_own_equipment_declaration_description: `Equipo propio ${RUN}`,
      employee_own_equipment_declaration_start_date: '2026-11-01',
      employee_own_equipment_declaration_monthly_fee: 350,
      employee_own_equipment_declaration_fee_source: 'adjusted',
      employee_own_equipment_declaration_status: 'active',
      employee_own_equipment_declaration_created_by_user_id: actorUserId(),
      employee_own_equipment_declaration_created_at: new Date(),
    })

    const id = Number(declarationId)
    createdDeclarationIds.push(id)
    return id
  }

  /**
   * Insumo de teletrabajo con su tipo y su resguardo, por tabla: espejo de
   * `createTeleworkSupplyForA` (`assets_telework_supplies.spec.ts:90-119`).
   * Devuelve el id del resguardo para que el caso varíe su estado, ya que el
   * puerto no expone la fila cruda.
   */
  async function createTeleworkSupply(
    overrides: TeleworkSupplyOverrides = {}
  ): Promise<{ employeeSupplyId: number; supplyId: number }> {
    fixtureSeq += 1
    const businessUnit = businessUnitId()

    const [typeId] = await db.table('supply_types').insert({
      business_unit_id: businessUnit,
      supply_type_name: `Insumo de teletrabajo ${RUN}-${fixtureSeq}`,
      supply_type_slug: `insumo-teletrabajo-${RUN}-${fixtureSeq}`,
      supply_type_telework_category: overrides.category ?? 'ergonomic_chair',
      supply_type_created_at: new Date(),
    })
    createdSupplyTypeIds.push(Number(typeId))

    const [supplyId] = await db.table('supplies').insert({
      business_unit_id: businessUnit,
      // `supply_file_number` es UNIQUE: rango propio de este spec y sufijo por
      // llamada para no chocar consigo mismo dentro de la misma corrida.
      supply_file_number: 3_000_000_000 + (Date.now() % 900_000_000) + fixtureSeq,
      supply_name: `Activo de teletrabajo ${fixtureSeq}`,
      supply_type_id: Number(typeId),
      supply_status: 'active',
      supply_deleted_at: overrides.supplyDeletedAt ?? null,
      supply_created_at: new Date(),
    })
    createdSupplyIds.push(Number(supplyId))

    const [employeeSupplyId] = await db.table('employee_supplies').insert({
      employee_id: employeeId(),
      supply_id: Number(supplyId),
      business_unit_id: businessUnit,
      employee_supply_status: overrides.status ?? 'active',
      employee_supply_assignament_date: '2026-08-01 00:00:00',
      employee_supply_created_at: new Date(),
    })
    createdEmployeeSupplyIds.push(Number(employeeSupplyId))

    return { employeeSupplyId: Number(employeeSupplyId), supplyId: Number(supplyId) }
  }

  /**
   * Corre `fn` y devuelve el código de error de MySQL si truena, o `undefined`
   * si no hubo error. Centraliza el try/catch + cast que antes repetían los
   * casos que esperan una violación de la BD (FK o UNIQUE).
   */
  async function dbErrorCode(fn: () => Promise<unknown>): Promise<string | undefined> {
    try {
      await fn()
      return undefined
    } catch (error) {
      return (error as { code?: string }).code
    }
  }

  group.setup(async () => {
    actor = await createTenantActor('equipo-propio-tabla')
    actorB = await createTenantActor('equipo-propio-tabla-b')
    employee = await createEmployeeFixture(
      actor.businessUnit.businessUnitId,
      `emp-${RUN.slice(-6)}`
    )
    employeeB = await createEmployeeFixture(
      actorB.businessUnit.businessUnitId,
      `empb-${RUN.slice(-6)}`
    )
  })

  // El colaborador es uno solo para todo el grupo: cada caso arrastra las filas
  // que insertó para que el UNIQUE de la vigente no se herede entre pruebas.
  group.each.teardown(async () => {
    if (createdDeclarationIds.length > 0) {
      await db
        .from('employee_own_equipment_declarations')
        .whereIn('employee_own_equipment_declaration_id', createdDeclarationIds)
        .delete()
      createdDeclarationIds.length = 0
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
    await cleanupEmployeeFixture(employee)
    await cleanupTenantActor(actorB)
    await cleanupTenantActor(actor)
  })

  test('CA-14: la FK impide borrar en duro al colaborador con una declaración', async ({
    assert,
  }) => {
    await insertDeclaration()

    const code = await dbErrorCode(() =>
      db.rawQuery('DELETE FROM employees WHERE employee_id = ?', [employeeId()])
    )

    assert.equal(code, 'ER_ROW_IS_REFERENCED_2')
  })

  test('CA-14: el UNIQUE admite una sola vigente por categoría; cerrar libera', async ({
    assert,
  }) => {
    const firstId = await insertDeclaration({ category: 'ergonomic_chair' })

    const code = await dbErrorCode(() => insertDeclaration({ category: 'ergonomic_chair' }))
    assert.equal(code, 'ER_DUP_ENTRY')

    // Cerrar la vigente la saca del índice (libera el slot de la categoría).
    await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', firstId)
      .update({ employee_own_equipment_declaration_status: 'closed' })

    // Nueva vigente de la misma categoría: entra sin ER_DUP_ENTRY.
    const afterClose = await dbErrorCode(() => insertDeclaration({ category: 'ergonomic_chair' }))
    assert.isUndefined(afterClose)
  })

  test('CA-14: el UNIQUE es por colaborador y categoría', async ({ assert }) => {
    await insertDeclaration({ category: 'ergonomic_chair' })

    // Otra categoría del mismo colaborador entra sin ER_DUP_ENTRY: el UNIQUE
    // incluye la categoría, así que dos categorías no comparten slot.
    const code = await dbErrorCode(() => insertDeclaration({ category: 'computing_equipment' }))

    assert.isUndefined(code)
  })

  test('CA-14: el borrado lógico también libera el slot del UNIQUE', async ({ assert }) => {
    const firstId = await insertDeclaration({ category: 'accessory' })

    // El borrado LÓGICO (no el cierre) también saca la fila del índice: al
    // llenar `..._deleted_at`, el `open_flag` generado pasa a NULL.
    await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', firstId)
      .update({ employee_own_equipment_declaration_deleted_at: new Date() })

    // Nueva vigente de la misma categoría: entra sin ER_DUP_ENTRY.
    const code = await dbErrorCode(() => insertDeclaration({ category: 'accessory' }))

    assert.isUndefined(code)
  })

  test('RF: findOpenByEmployees respeta el alcance y las listas vacías', async ({ assert }) => {
    const declarationAId = await insertDeclaration({ category: 'ergonomic_chair' })
    const declarationBId = await insertDeclaration({
      category: 'ergonomic_chair',
      employeeId: employeeIdB(),
      businessUnitId: businessUnitIdB(),
    })

    // Con el alcance de A (E1) y su id solo entra la vigente de A: la de B (E2)
    // queda fuera aunque exista (R3).
    const open = await repository.findOpenByEmployees([businessUnitId()], [employeeId()])
    assert.equal(open.length, 1)
    assert.equal(open[0].employeeId, employeeId())
    assert.equal(open[0].declaration.declarationId, declarationAId)

    // Cualquier lista vacía corta sin consultar.
    assert.deepEqual(await repository.findOpenByEmployees([], [employeeId()]), [])
    assert.deepEqual(await repository.findOpenByEmployees([businessUnitId()], []), [])

    // La de B sí es vigente, pero solo con el alcance de B.
    const openB = await repository.findOpenByEmployees([businessUnitIdB()], [employeeIdB()])
    assert.equal(openB.length, 1)
    assert.equal(openB[0].declaration.declarationId, declarationBId)
  })

  test('RF: hasOpenCoverage solo con resguardo abierto de la categoría', async ({ assert }) => {
    const inScope = (category: OwnEquipmentCategory) =>
      repository.hasOpenCoverage(db, [businessUnitId()], employeeId(), category)

    // Resguardo `active` de la categoría: cubre.
    const live = await createTeleworkSupply({ category: 'ergonomic_chair', status: 'active' })
    assert.isTrue(await inScope('ergonomic_chair'))

    // `shipping` (va en camino) también cuenta como abierto y bloquea declarar
    // (R6, CA-4).
    await db
      .from('employee_supplies')
      .where('employee_supply_id', live.employeeSupplyId)
      .update({ employee_supply_status: 'shipping' })
    assert.isTrue(await inScope('ergonomic_chair'))

    // `retired` (devuelto) no cubre.
    await db
      .from('employee_supplies')
      .where('employee_supply_id', live.employeeSupplyId)
      .update({ employee_supply_status: 'retired' })
    assert.isFalse(await inScope('ergonomic_chair'))

    // Devolución LÓGICA de un resguardo vivo: la fila sigue `active` pero ya no
    // cubre.
    await db
      .from('employee_supplies')
      .where('employee_supply_id', live.employeeSupplyId)
      .update({ employee_supply_status: 'active', employee_supply_deleted_at: new Date() })
    assert.isFalse(await inScope('ergonomic_chair'))

    // Activo borrado lógicamente con el resguardo vivo: tampoco cubre.
    await createTeleworkSupply({
      category: 'ergonomic_chair',
      status: 'active',
      supplyDeletedAt: new Date(),
    })
    assert.isFalse(await inScope('ergonomic_chair'))

    // Otra categoría: el resguardo abierto es de `computing_equipment`, así que
    // no cubre la categoría consultada.
    await createTeleworkSupply({ category: 'computing_equipment', status: 'active' })
    assert.isTrue(await inScope('computing_equipment'))
    assert.isFalse(await inScope('ergonomic_chair'))
  })

  test('RF: hasOpenDeclaration solo cuenta la vigente', async ({ assert }) => {
    const declarationId = await insertDeclaration({ category: 'accessory' })
    const inScope = () =>
      repository.hasOpenDeclaration(db, [businessUnitId()], employeeId(), 'accessory')

    // `active` y viva: cuenta.
    assert.isTrue(await inScope())

    // Cerrada: deja de contar.
    await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', declarationId)
      .update({ employee_own_equipment_declaration_status: 'closed' })
    assert.isFalse(await inScope())

    // Borrado lógico: tampoco cuenta aunque siga `active`.
    await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', declarationId)
      .update({
        employee_own_equipment_declaration_status: 'active',
        employee_own_equipment_declaration_deleted_at: new Date(),
      })
    assert.isFalse(await inScope())
  })

  test('RF: findEmployeeForDeclaration descarta ajeno, inexistente y dado de baja', async ({
    assert,
  }) => {
    // Porcentaje real capturado en la fila: el fixture nace Onsite sin él, así
    // que el caso lo fija para probar que vuelve como número, no como texto.
    await db
      .from('employees')
      .where('employee_id', employeeId())
      .update({ employee_telework_percentage: 40 })

    // En alcance y vivo: la empresa sale de su propia fila, nunca del argumento.
    assert.deepEqual(
      await repository.findEmployeeForDeclaration(db, [businessUnitId()], employeeId(), {
        lock: false,
      }),
      { employeeId: employeeId(), businessUnitId: businessUnitId(), teleworkPercentage: 40 }
    )

    // Con candado dentro de la transacción: `forUpdate` corre y devuelve la misma fila.
    assert.deepEqual(
      await db.transaction((trx) =>
        repository.findEmployeeForDeclaration(trx, [businessUnitId()], employeeId(), {
          lock: true,
        })
      ),
      { employeeId: employeeId(), businessUnitId: businessUnitId(), teleworkPercentage: 40 }
    )

    // Ajeno: el id de B con el alcance de A no existe para la consulta.
    assert.isNull(
      await repository.findEmployeeForDeclaration(db, [businessUnitId()], employeeIdB(), {
        lock: false,
      })
    )

    // Inexistente: el mismo resultado que el ajeno.
    assert.isNull(
      await repository.findEmployeeForDeclaration(db, [businessUnitId()], 2_000_000_000, {
        lock: false,
      })
    )

    // Dado de baja lógica: fuera.
    await db
      .from('employees')
      .where('employee_id', employeeId())
      .update({ employee_deleted_at: new Date() })
    assert.isNull(
      await repository.findEmployeeForDeclaration(db, [businessUnitId()], employeeId(), {
        lock: false,
      })
    )

    // Se restaura para no arrastrar la baja al resto del grupo.
    await db
      .from('employees')
      .where('employee_id', employeeId())
      .update({ employee_deleted_at: null })
  })

  test('RF: insert escribe la fila completa y findById la devuelve como DTO', async ({ assert }) => {
    const description = `Laptop propia ${RUN}`
    const declarationId = await db.transaction((trx) =>
      repository.insert(trx, {
        employeeId: employeeId(),
        businessUnitId: businessUnitId(),
        category: 'computing_equipment',
        description,
        conditions: null,
        startDate: '2026-11-01',
        monthlyFee: 350,
        feeSource: 'adjusted',
        createdByUserId: actorUserId(),
      })
    )
    createdDeclarationIds.push(declarationId)

    // La fila queda como esta historia la escribe: `adjusted`, `active`, sin
    // fecha de término ni motivo de cierre y con la autoría del actor.
    const stored: {
      employee_own_equipment_declaration_fee_source: string
      employee_own_equipment_declaration_status: string
      employee_own_equipment_declaration_created_by_user_id: number
      employee_own_equipment_declaration_end_date: string | null
    } = await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', declarationId)
      .select(
        'employee_own_equipment_declaration_fee_source',
        'employee_own_equipment_declaration_status',
        'employee_own_equipment_declaration_created_by_user_id',
        'employee_own_equipment_declaration_end_date'
      )
      .firstOrFail()

    assert.equal(stored.employee_own_equipment_declaration_fee_source, 'adjusted')
    assert.equal(stored.employee_own_equipment_declaration_status, 'active')
    assert.equal(stored.employee_own_equipment_declaration_created_by_user_id, actorUserId())
    assert.isNull(stored.employee_own_equipment_declaration_end_date)

    // DTO: DECIMAL a número, DATE a `YYYY-MM-DD`, `created_at` a ISO.
    const dto = required(
      await repository.findById(db, [businessUnitId()], declarationId),
      'la declaración insertada'
    )
    assert.equal(dto.declarationId, declarationId)
    assert.equal(dto.employeeId, employeeId())
    assert.equal(dto.category, 'computing_equipment')
    assert.equal(dto.description, description)
    assert.isNull(dto.conditions)
    assert.equal(dto.startDate, '2026-11-01')
    assert.isNumber(dto.monthlyFee)
    assert.equal(dto.monthlyFee, 350)
    assert.equal(dto.status, 'active')
    assert.match(dto.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

    // Id inexistente o fuera de alcance: `null`.
    assert.isNull(await repository.findById(db, [businessUnitId()], 2_000_000_000))
    assert.isNull(await repository.findById(db, [businessUnitIdB()], declarationId))
  })
})

/**
 * Declaración del uso de equipo propio con su cuota (VLRH-H1791306075599).
 *
 * Parte 2 (CA-1 a CA-12): el alta HTTP
 * `POST /api/employees/:employeeId/own-equipment-declarations` con el gate de
 * Empleados (`employees:manage-employee-supplies`, bypass `standard`). Espeja la
 * parte HTTP de `assets_telework_supplies.spec.ts`: el actor A administra su
 * ficha con el permiso concedido por `grantModulePermissions`, el catálogo de
 * activos y resguardos se arma por tabla, y el 404 indistinguible se compara
 * exacto sobre el cuerpo completo. La exigencia del módulo `employees` nace
 * apagada en la entrega, así que el grupo la enciende y la repone en el
 * teardown (patrón de `employee_contract_structure_optional.spec.ts`).
 */
test.group('Declaraciones de equipo propio — endpoint HTTP', (group) => {
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null
  let owner: UnitUser | null = null
  let root: UnitUser | null = null
  let employeeA: EmployeeFixture | null = null
  let employeeB: EmployeeFixture | null = null
  let previousEmployeesEnforcement = false

  let fixtureSeq = 0
  const createdDeclarationIds: number[] = []
  const createdSupplyTypeIds: number[] = []
  const createdSupplyIds: number[] = []
  const createdEmployeeSupplyIds: number[] = []

  const actorAUser = () => required(actorA, 'el actor A').user
  const employeeIdA = () => required(employeeA, 'el colaborador A').employee.employeeId
  const employeeIdB = () => required(employeeB, 'el colaborador B').employee.employeeId
  const buIdA = () => required(actorA, 'el actor A').businessUnit.businessUnitId
  const buPublicIdA = () => required(actorA, 'el actor A').businessUnit.businessUnitPublicId
  const buPublicIdB = () => required(actorB, 'el actor B').businessUnit.businessUnitPublicId

  /**
   * Cuerpo mínimo válido del alta (con cuota) ; el caso solo cambia lo que
   * necesita. `businessUnitId`/`payrollBusinessUnitId` los inyecta el
   * middleware de scope en el body, así que no se declaran aquí.
   */
  const BASE_PAYLOAD = {
    category: 'ergonomic_chair',
    description: 'Silla de oficina con respaldo ajustable',
    conditions: 'Buen estado; uso exclusivo para trabajo',
    startDate: '2026-11-01',
    monthlyFee: 350,
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

  /** Alta como el actor A, dueño de la ficha en el alcance de la ruta. */
  const postAsA = (client: ApiClient, employeeId: number, payload: Record<string, unknown>) =>
    postAs(client, actorAUser(), buPublicIdA(), employeeId, payload)

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

  /**
   * Insumo de teletrabajo con su tipo y resguardo, por tabla: espejo de
   * `createTeleworkSupplyForA` (`assets_telework_supplies.spec.ts:90-119`).
   * Devuelve el id del resguardo para que el caso varíe su estado.
   */
  async function createTeleworkSupply(
    overrides: { category?: OwnEquipmentCategory; status?: AssignmentStatus } = {}
  ): Promise<{ employeeSupplyId: number; supplyId: number }> {
    fixtureSeq += 1
    const businessUnit = buIdA()

    const [typeId] = await db.table('supply_types').insert({
      business_unit_id: businessUnit,
      supply_type_name: `Insumo teletrabajo HTTP ${RUN}-${fixtureSeq}`,
      supply_type_slug: `insumo-teletrabajo-http-${RUN}-${fixtureSeq}`,
      supply_type_telework_category: overrides.category ?? 'ergonomic_chair',
      supply_type_created_at: new Date(),
    })
    createdSupplyTypeIds.push(Number(typeId))

    const [supplyId] = await db.table('supplies').insert({
      business_unit_id: businessUnit,
      supply_file_number: 2_000_000_000 + (Date.now() % 100_000_000) + fixtureSeq,
      supply_name: `Activo teletrabajo HTTP ${fixtureSeq}`,
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

  /** Modalidad de teletrabajo del colaborador A por tabla. */
  async function setTelework(employeeId: number, percentage: number): Promise<void> {
    await db
      .from('employees')
      .where('employee_id', employeeId)
      .update({ employee_telework_percentage: percentage })
  }

  group.setup(async () => {
    // La exigencia del módulo `employees` nace apagada (estado de entrega):
    // se enciende solo para este grupo y se repone en el teardown.
    previousEmployeesEnforcement = await setModuleEnforcement('employees', true)
    await assertModuleEnforced('employees')

    actorA = await createTenantActor('equipo-propio-http-a')
    await grantModulePermissions(actorA, 'employees', ['manage-employee-supplies'])
    actorB = await createTenantActor('equipo-propio-http-b')
    owner = await createBypassUserInBusinessUnit(
      'owner',
      `equipo-propio-owner-${RUN.slice(-6)}`,
      actorA.businessUnit.businessUnitId
    )
    root = await createBypassUserInBusinessUnit(
      'root',
      `equipo-propio-root-${RUN.slice(-6)}`,
      actorA.businessUnit.businessUnitId
    )
    employeeA = await createEmployeeFixture(actorA.businessUnit.businessUnitId, `empA-${RUN.slice(-6)}`)
    employeeB = await createEmployeeFixture(actorB.businessUnit.businessUnitId, `empB-${RUN.slice(-6)}`)
    await setTelework(employeeA.employee.employeeId, 100)
  })

  // Cada caso parte de un colaborador A en teletrabajo y vivo: los que bajan el
  // porcentaje o lo dan de baja lógica lo dejan así solo dentro de su caso.
  group.each.setup(async () => {
    if (employeeA) {
      await db
        .from('employees')
        .where('employee_id', employeeA.employee.employeeId)
        .update({ employee_telework_percentage: 100, employee_deleted_at: null })
    }
  })

  // Cada caso arrastra sus filas para que la vigente no se herede entre pruebas
  // (el UNIQUE admite una sola `active` por colaborador y categoría).
  group.each.teardown(async () => {
    if (createdDeclarationIds.length > 0) {
      await db
        .from('employee_own_equipment_declarations')
        .whereIn('employee_own_equipment_declaration_id', createdDeclarationIds)
        .delete()
      createdDeclarationIds.length = 0
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
    await cleanupUnitUser(root)
    await cleanupUnitUser(owner)
    await cleanupTenantActor(actorB)
    await cleanupTenantActor(actorA)
    await setModuleEnforcement('employees', previousEmployeesEnforcement)
  })

  test('CA-1: declarar con cuota capturada responde 201 y deja la fila ajustada', async ({
    client,
    assert,
  }) => {
    const response = await postAsA(client, employeeIdA(), { ...BASE_PAYLOAD, monthlyFee: 350 })
    response.assertStatus(201)

    const body = response.body()
    assert.equal(body.type, 'success')
    assert.equal(body.title, 'Declaración de equipo propio')
    assert.equal(body.message, 'Declaración de equipo propio guardada')

    const data = body.data
    createdDeclarationIds.push(data.declarationId)
    assert.equal(data.employeeId, employeeIdA())
    assert.equal(data.category, 'ergonomic_chair')
    assert.equal(data.description, 'Silla de oficina con respaldo ajustable')
    assert.equal(data.conditions, 'Buen estado; uso exclusivo para trabajo')
    assert.equal(data.status, 'active')
    assert.equal(data.monthlyFee, 350)
    assert.equal(data.startDate, '2026-11-01')
    assert.match(data.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

    const stored: {
      fee_source: string
      file: string | null
      end_date: string | null
      closed_reason: string | null
      closed_by_user_id: number | null
      created_by_user_id: number
      business_unit_id: number
      employee_id: number
    } = await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', data.declarationId)
      .select(
        'employee_own_equipment_declaration_fee_source as fee_source',
        'employee_own_equipment_declaration_file as file',
        'employee_own_equipment_declaration_end_date as end_date',
        'employee_own_equipment_declaration_closed_reason as closed_reason',
        'employee_own_equipment_declaration_closed_by_user_id as closed_by_user_id',
        'employee_own_equipment_declaration_created_by_user_id as created_by_user_id',
        'business_unit_id',
        'employee_id'
      )
      .firstOrFail()

    assert.equal(stored.fee_source, 'adjusted')
    assert.isNull(stored.file)
    assert.isNull(stored.end_date)
    assert.isNull(stored.closed_reason)
    assert.isNull(stored.closed_by_user_id)
    assert.equal(stored.created_by_user_id, actorAUser().userId)
    assert.equal(stored.business_unit_id, buIdA())
    assert.equal(stored.employee_id, employeeIdA())
  })

  test('CA-2: la cuota 0 y los decimales válidos se registran tal cual', async ({
    client,
    assert,
  }) => {
    const computing = await postAsA(client, employeeIdA(), {
      ...BASE_PAYLOAD,
      category: 'computing_equipment',
      monthlyFee: 0,
    })
    computing.assertStatus(201)
    createdDeclarationIds.push(computing.body().data.declarationId)
    assert.equal(computing.body().data.monthlyFee, 0)

    const accessory = await postAsA(client, employeeIdA(), {
      ...BASE_PAYLOAD,
      category: 'accessory',
      monthlyFee: 0.29,
    })
    accessory.assertStatus(201)
    createdDeclarationIds.push(accessory.body().data.declarationId)
    assert.equal(accessory.body().data.monthlyFee, 0.29)
  })

  test('CA-3: la cuota inválida responde 422 y no crea fila', async ({ client, assert }) => {
    // `undefined` = cuota ausente; el resto son los valores discriminantes.
    const invalidFees: unknown[] = [-1, undefined, null, '', 'abc', 12.345, 100000000]

    for (const monthlyFee of invalidFees) {
      const payload: Record<string, unknown> = { ...BASE_PAYLOAD }
      if (monthlyFee === undefined) {
        delete payload.monthlyFee
      } else {
        payload.monthlyFee = monthlyFee
      }

      const response = await postAsA(client, employeeIdA(), payload)
      response.assertStatus(422)
      assert.equal(response.body().key, 'cuota-de-equipo-propio-invalida')
      assert.equal(response.body().title, 'Cuota de equipo propio inválida')
    }

    assert.equal(await activeDeclarationCount(employeeIdA(), 'ergonomic_chair'), 0)
  })

  test('CA-4: la categoría cubierta por un activo se rechaza, en resguardo o en envío', async ({
    client,
    assert,
  }) => {
    const { employeeSupplyId } = await createTeleworkSupply({
      category: 'computing_equipment',
      status: 'active',
    })

    const active = await postAsA(client, employeeIdA(), {
      ...BASE_PAYLOAD,
      category: 'computing_equipment',
    })
    active.assertStatus(409)
    assert.equal(active.body().key, 'categoria-cubierta-por-activo')

    await db
      .from('employee_supplies')
      .where('employee_supply_id', employeeSupplyId)
      .update({ employee_supply_status: 'shipping' })
    const shipping = await postAsA(client, employeeIdA(), {
      ...BASE_PAYLOAD,
      category: 'computing_equipment',
    })
    shipping.assertStatus(409)
    assert.equal(shipping.body().key, 'categoria-cubierta-por-activo')

    // Resguardo devuelto: deja de cubrir y la declaración entra.
    await db
      .from('employee_supplies')
      .where('employee_supply_id', employeeSupplyId)
      .update({ employee_supply_status: 'retired' })
    const retired = await postAsA(client, employeeIdA(), {
      ...BASE_PAYLOAD,
      category: 'computing_equipment',
    })
    retired.assertStatus(201)
    createdDeclarationIds.push(retired.body().data.declarationId)
  })

  test('CA-5: a lo más una vigente por categoría; otra categoría sí', async ({
    client,
    assert,
  }) => {
    const first = await postAsA(client, employeeIdA(), {
      ...BASE_PAYLOAD,
      category: 'ergonomic_chair',
    })
    first.assertStatus(201)
    createdDeclarationIds.push(first.body().data.declarationId)

    const again = await postAsA(client, employeeIdA(), {
      ...BASE_PAYLOAD,
      category: 'ergonomic_chair',
    })
    again.assertStatus(409)
    assert.equal(again.body().key, 'declaracion-de-equipo-propio-vigente-existente')

    const other = await postAsA(client, employeeIdA(), {
      ...BASE_PAYLOAD,
      category: 'computing_equipment',
    })
    other.assertStatus(201)
    createdDeclarationIds.push(other.body().data.declarationId)
  })

  test('CA-6: el doble envío simultáneo deja una sola fila', async ({ client, assert }) => {
    const payload = { ...BASE_PAYLOAD, category: 'accessory' }
    const [first, second] = await Promise.all([
      postAsA(client, employeeIdA(), payload),
      postAsA(client, employeeIdA(), payload),
    ])

    const statuses = [first.status(), second.status()].sort((a, b) => a - b)
    assert.deepEqual(statuses, [201, 409])

    const conflict = first.status() === 409 ? first : second
    assert.equal(conflict.body().key, 'declaracion-de-equipo-propio-vigente-existente')

    const created = first.status() === 201 ? first : second
    createdDeclarationIds.push(created.body().data.declarationId)

    assert.equal(await activeDeclarationCount(employeeIdA(), 'accessory'), 1)
  })

  test('CA-7: sin teletrabajo se rechaza con 422', async ({ client, assert }) => {
    await setTelework(employeeIdA(), 0)

    const response = await postAsA(client, employeeIdA(), { ...BASE_PAYLOAD })
    response.assertStatus(422)
    assert.equal(response.body().key, 'colaborador-sin-teletrabajo')
    assert.equal(response.body().title, 'Colaborador sin teletrabajo')
    assert.equal(await activeDeclarationCount(employeeIdA(), 'ergonomic_chair'), 0)
  })

  test('CA-8: ajeno, inexistente y dado de baja responden el mismo 404', async ({
    client,
    assert,
  }) => {
    // Tercer caso: el MISMO colaborador A dado de baja lógica de forma temporal.
    await db
      .from('employees')
      .where('employee_id', employeeIdA())
      .update({ employee_deleted_at: new Date() })
    const deleted = await postAsA(client, employeeIdA(), { ...BASE_PAYLOAD })
    await db
      .from('employees')
      .where('employee_id', employeeIdA())
      .update({ employee_deleted_at: null })

    const foreign = await postAsA(client, employeeIdB(), { ...BASE_PAYLOAD })
    const missing = await postAsA(client, 2_000_000_000, { ...BASE_PAYLOAD })

    for (const response of [foreign, missing, deleted]) response.assertStatus(404)

    const expected = {
      type: 'error',
      title: 'Colaborador no encontrado',
      message: 'El colaborador no existe o no pertenece a la empresa.',
      detail: 'El colaborador no existe o no pertenece a la empresa.',
      key: 'colaborador-no-encontrado',
      data: null,
    }
    assert.deepEqual(foreign.body(), expected)
    assert.deepEqual(missing.body(), expected)
    assert.deepEqual(deleted.body(), expected)
    assert.equal(await activeDeclarationCount(employeeIdA()), 0)
  })

  test('CA-9: categoría, campos y lista blanca', async ({ client, assert }) => {
    const badCategory = await postAsA(client, employeeIdA(), {
      ...BASE_PAYLOAD,
      category: 'monitor',
    })
    badCategory.assertStatus(422)
    assert.equal(badCategory.body().key, 'categoria-de-insumo-invalida')

    const invalidFields: Array<Record<string, unknown>> = [
      { ...BASE_PAYLOAD, description: '' },
      { ...BASE_PAYLOAD, description: 'a'.repeat(256) },
      { ...BASE_PAYLOAD, conditions: 'a'.repeat(2001) },
      { ...BASE_PAYLOAD, startDate: '2026-02-30' },
    ]
    for (const payload of invalidFields) {
      const response = await postAsA(client, employeeIdA(), payload)
      response.assertStatus(422)
      assert.equal(response.body().key, 'entrada-invalida')
    }

    // Lista blanca: los campos del servidor se ignoran y la fila sale de la ruta.
    // `businessUnitId` viaja como el código público de la MISMA empresa (uno
    // fuera del alcance lo rechaza el middleware de scope con su 404 propio);
    // queda en la fila la empresa del colaborador de la ruta, no la del body.
    const whitelist = await postAsA(client, employeeIdA(), {
      ...BASE_PAYLOAD,
      category: 'accessory',
      monthlyFee: 120,
      feeSource: 'default',
      status: 'closed',
      endDate: '2027-01-01',
      businessUnitId: buPublicIdA(),
      employeeId: employeeIdB(),
    })
    whitelist.assertStatus(201)

    const declarationId = whitelist.body().data.declarationId
    createdDeclarationIds.push(declarationId)

    const stored: {
      fee_source: string
      status: string
      end_date: string | null
      business_unit_id: number
      employee_id: number
    } = await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', declarationId)
      .select(
        'employee_own_equipment_declaration_fee_source as fee_source',
        'employee_own_equipment_declaration_status as status',
        'employee_own_equipment_declaration_end_date as end_date',
        'business_unit_id',
        'employee_id'
      )
      .firstOrFail()

    assert.equal(stored.fee_source, 'adjusted')
    assert.equal(stored.status, 'active')
    assert.isNull(stored.end_date)
    assert.equal(stored.business_unit_id, buIdA())
    assert.equal(stored.employee_id, employeeIdA())
  })

  test('CA-12: sin manage-employee-supplies el gate responde 403; root y owner cruzan', async ({
    client,
    assert,
  }) => {
    // El actor B no tiene el permiso del gate; el módulo está exigido.
    const denied = await postAs(
      client,
      required(actorB, 'el actor B').user,
      buPublicIdB(),
      employeeIdB(),
      { ...BASE_PAYLOAD }
    )
    assertPermissionDenied(assert, denied)
    assert.equal(await activeDeclarationCount(employeeIdB()), 0)

    // El bypass entra con categorías distintas: dentro del mismo caso solo hay
    // teardown por prueba, así que la segunda chocaría con la vigente de la primera.
    const bypassCases: Array<[User, OwnEquipmentCategory]> = [
      [required(owner, 'el owner').user, 'ergonomic_chair'],
      [required(root, 'el root').user, 'computing_equipment'],
    ]
    for (const [user, category] of bypassCases) {
      const response = await postAs(client, user, buPublicIdA(), employeeIdA(), {
        ...BASE_PAYLOAD,
        category,
        monthlyFee: 350,
      })
      response.assertStatus(201)
      createdDeclarationIds.push(response.body().data.declarationId)
    }
  })
})

/**
 * `parseMonthlyFee` es pura y la exporta el servicio (spec §7 paso 5); el censo
 * no le da spec unitario, así que sus casos puros viven aquí. Discriminantes:
 * `0` y `0.29` entran (una validación `Math.round(v * 100) === v * 100` rechaza
 * 0.29) y `""` sale (un `Number("") === 0` lo dejaría pasar).
 */
test.group('parseMonthlyFee — validación pura de la cuota', () => {
  async function loadParser() {
    const { parseMonthlyFee } = await import('#modules/assets/own_equipment_declarations.service')
    return parseMonthlyFee
  }

  test('acepta número o texto con hasta dos decimales dentro del máximo', async ({ assert }) => {
    const parseMonthlyFee = await loadParser()

    assert.equal(parseMonthlyFee(0), 0)
    assert.equal(parseMonthlyFee(350), 350)
    assert.equal(parseMonthlyFee(0.29), 0.29)
    assert.equal(parseMonthlyFee('0'), 0)
    assert.equal(parseMonthlyFee('350'), 350)
    assert.equal(parseMonthlyFee('0.29'), 0.29)
    assert.equal(parseMonthlyFee('99999999.99'), 99999999.99)
  })

  test('rechaza ausente, negativo, no numérico, más de dos decimales y sobre el máximo', async ({
    assert,
  }) => {
    const parseMonthlyFee = await loadParser()

    const invalid: unknown[] = [-1, undefined, null, '', 'abc', '12.345', 12.345, 100000000, true, {}]
    for (const value of invalid) {
      let thrown: unknown = null
      try {
        parseMonthlyFee(value)
      } catch (error) {
        thrown = error
      }
      assert.instanceOf(thrown, AssetError, `no lanzó con ${String(value)}`)
      assert.equal((thrown as AssetError).key, 'cuota-de-equipo-propio-invalida')
      assert.equal((thrown as AssetError).httpStatus, 422)
    }
  })
})
