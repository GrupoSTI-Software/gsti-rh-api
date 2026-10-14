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
 * duro, el UNIQUE sobre la columna generada admite a lo sumo una declaración
 * vigente por colaborador y categoría (cerrar libera el índice) y la
 * declaración queda atada a la empresa de su colaborador. El ciclo de alta por
 * API lo agregan las tareas siguientes sobre este mismo archivo.
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

    let code: string | undefined
    try {
      await db.rawQuery('DELETE FROM employees WHERE employee_id = ?', [employeeId()])
    } catch (error) {
      code = (error as { code?: string }).code
    }

    assert.equal(code, 'ER_ROW_IS_REFERENCED_2')
  })

  test('CA-14: el UNIQUE admite una sola vigente por categoría; cerrar libera', async ({
    assert,
  }) => {
    const firstId = await insertDeclaration({ category: 'ergonomic_chair' })

    let code: string | undefined
    try {
      await insertDeclaration({ category: 'ergonomic_chair' })
    } catch (error) {
      code = (error as { code?: string }).code
    }
    assert.equal(code, 'ER_DUP_ENTRY')

    // Cerrar la vigente la saca del índice (libera el slot de la categoría).
    await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', firstId)
      .update({ employee_own_equipment_declaration_status: 'closed' })

    // Nueva vigente de la misma categoría: entra sin ER_DUP_ENTRY.
    await insertDeclaration({ category: 'ergonomic_chair' })
  })

  test('CA-14: la tabla distingue categorías y empresas', async ({ assert }) => {
    const chairId = await insertDeclaration({ category: 'ergonomic_chair' })
    // Otra categoría del mismo colaborador entra: el UNIQUE es por categoría.
    const computingId = await insertDeclaration({ category: 'computing_equipment' })

    const rows: { employee_own_equipment_declaration_id: number; business_unit_id: number }[] =
      await db
        .from('employee_own_equipment_declarations')
        .whereIn('employee_own_equipment_declaration_id', [chairId, computingId])
        .select('employee_own_equipment_declaration_id', 'business_unit_id')

    assert.lengthOf(rows, 2)
    // La declaración queda atada a la empresa del colaborador, nunca otra.
    for (const row of rows) {
      assert.equal(row.business_unit_id, businessUnitId())
    }
  })
})
