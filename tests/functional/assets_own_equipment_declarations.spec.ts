import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import OwnEquipmentDeclarationsRepositoryMysql from '#modules/assets/own_equipment_declarations.repository.mysql'
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
