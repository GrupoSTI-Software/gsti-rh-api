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
