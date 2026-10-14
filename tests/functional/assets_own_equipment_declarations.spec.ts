import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
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
 * Declaración del uso de equipo propio con su cuota (VLRH-H1791306075599) —
 * parte 1: la tabla y sus invariantes de BD, SIN HTTP.
 *
 * Prueba lo único que la migración garantiza por sí sola (CA-14): la FK sin
 * cascada conserva la evidencia NOM-037 aunque se borre al colaborador en
 * duro, y el UNIQUE sobre la columna generada admite a lo sumo una declaración
 * vigente por colaborador y categoría: cerrar y el borrado lógico liberan el
 * índice, y otra categoría del mismo colaborador entra sin choque. El ciclo de
 * alta por API lo agregan las tareas siguientes sobre este mismo archivo.
 */

const RUN = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

/** Las tres categorías de insumo de teletrabajo (orden de la norma). */
type OwnEquipmentCategory = 'ergonomic_chair' | 'computing_equipment' | 'accessory'

/** Columnas que el caso puede variar sobre la fila mínima del helper. */
interface DeclarationOverrides {
  category?: OwnEquipmentCategory
}

test.group('Declaraciones de equipo propio — tabla (sin HTTP)', (group) => {
  let actor: TenantActor | null = null
  let employee: EmployeeFixture | null = null
  const createdDeclarationIds: number[] = []

  const actorUserId = () => required(actor, 'el actor').user.userId
  const employeeId = () => required(employee, 'el colaborador').employee.employeeId
  const businessUnitId = () => required(actor, 'el actor').businessUnit.businessUnitId

  /**
   * Inserta una declaración mínima por tabla, colgada del colaborador y la
   * empresa del fixture. La empresa es SIEMPRE la del colaborador, nunca otra;
   * `created_by_user_id` es el usuario del actor. Las columnas que solo
   * escriben las historias siguientes van con sus valores por defecto.
   */
  async function insertDeclaration(overrides: DeclarationOverrides = {}): Promise<number> {
    const [declarationId] = await db.table('employee_own_equipment_declarations').insert({
      employee_id: employeeId(),
      business_unit_id: businessUnitId(),
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
    employee = await createEmployeeFixture(
      actor.businessUnit.businessUnitId,
      `emp-${RUN.slice(-6)}`
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
  })

  group.teardown(async () => {
    await cleanupEmployeeFixture(employee)
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
})
