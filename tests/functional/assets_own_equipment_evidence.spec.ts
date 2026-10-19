import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import {
  ASSET_FILE_NAME_PREFIX,
  OWN_EQUIPMENT_EVIDENCE_S3_FOLDER,
} from '#modules/assets/assets.constants'
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
 * Evidencia adjunta de la declaración de equipo propio (VLRH-H1791493046616).
 *
 * Parte 1 (sin HTTP): el contrato de datos que consumen el alta y la descarga.
 * Prueba que la columna `..._file` se escribe en el `insert` (y queda en NULL
 * cuando no viene archivo), que el DTO expone `hasEvidence` SIN exponer jamás
 * la key, y que `findEvidencePath` devuelve la ruta viva de una declaración
 * vigente o cerrada dentro del alcance de empresas, con `null` indistinguible
 * para la ajena, la inexistente y la borrada lógicamente (R3/CA-8, regla 8: el
 * cierre conserva la evidencia). Las partes HTTP (subida en el alta y descarga
 * por stream) las agregan las tareas siguientes sobre este mismo archivo.
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
  /**
   * Key del objeto en S3 tal como la escribiría el alta; ausente o `null` deja
   * la columna en NULL y `''` la deja vacía (ninguna de las dos es evidencia).
   */
  file?: string | null
}

test.group('Declaraciones de equipo propio — evidencia (sin HTTP)', (group) => {
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

  /** Key de evidencia con la carpeta real del módulo, bajo el prefijo del intake. */
  const evidenceKey = (fileName: string) =>
    `valanserhfiles/${OWN_EQUIPMENT_EVIDENCE_S3_FOLDER}/${businessUnitId()}/${fileName}`

  /**
   * Inserta una declaración mínima por tabla, colgada del colaborador y la
   * empresa del fixture —por defecto los de A; el caso puede apuntar a B para
   * probar el aislamiento entre empresas. La empresa es SIEMPRE la del
   * colaborador, nunca otra; `created_by_user_id` es el usuario del actor. La
   * columna de la evidencia se escribe tal cual la recibe, para que el caso
   * pueda distinguir NULL de cadena vacía.
   */
  async function insertDeclaration(overrides: DeclarationOverrides = {}): Promise<number> {
    const [declarationId] = await db.table('employee_own_equipment_declarations').insert({
      employee_id: overrides.employeeId ?? employeeId(),
      business_unit_id: overrides.businessUnitId ?? businessUnitId(),
      employee_own_equipment_declaration_category: overrides.category ?? 'ergonomic_chair',
      employee_own_equipment_declaration_description: `Equipo propio con evidencia ${RUN}`,
      employee_own_equipment_declaration_start_date: '2026-11-01',
      employee_own_equipment_declaration_monthly_fee: 350,
      employee_own_equipment_declaration_fee_source: 'adjusted',
      employee_own_equipment_declaration_status: 'active',
      employee_own_equipment_declaration_file: overrides.file ?? null,
      employee_own_equipment_declaration_created_by_user_id: actorUserId(),
      employee_own_equipment_declaration_created_at: new Date(),
    })

    const id = Number(declarationId)
    createdDeclarationIds.push(id)
    return id
  }

  /** Columna cruda de la evidencia, tal como quedó en la fila. */
  async function storedFile(declarationId: number): Promise<string | null> {
    const row: { file: string | null } = await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', declarationId)
      .select('employee_own_equipment_declaration_file as file')
      .firstOrFail()

    return row.file
  }

  group.setup(async () => {
    actor = await createTenantActor('equipo-propio-evidencia')
    actorB = await createTenantActor('equipo-propio-evidencia-b')
    employee = await createEmployeeFixture(actor.businessUnit.businessUnitId, `emp-${RUN.slice(-6)}`)
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
  })

  group.teardown(async () => {
    await cleanupEmployeeFixture(employeeB)
    await cleanupEmployeeFixture(employee)
    await cleanupTenantActor(actorB)
    await cleanupTenantActor(actor)
  })

  test('RF: insert escribe la columna de evidencia y findById expone hasEvidence', async ({
    assert,
  }) => {
    const key = evidenceKey('c1.pdf')

    // Con archivo: la key se escribe tal cual y el DTO solo la delata con un booleano.
    const withFileId = await insertDeclaration({ file: key })
    assert.equal(await storedFile(withFileId), key)

    const withFile = required(
      await repository.findById(db, [businessUnitId()], withFileId),
      'la declaración con evidencia'
    )
    assert.isTrue(withFile.hasEvidence)
    // La key es privada (§14): el DTO nunca expone la columna ni su contenido.
    assert.notProperty(withFile, 'employee_own_equipment_declaration_file')
    assert.notInclude(JSON.stringify(withFile), key)

    // Sin archivo: la columna queda NULL (`row.file ?? null`) y el DTO lo dice.
    // Categoría distinta de la anterior: el UNIQUE admite una sola vigente por
    // colaborador y categoría.
    const withoutFileId = await insertDeclaration({ category: 'computing_equipment' })
    assert.isNull(await storedFile(withoutFileId))

    const withoutFile = required(
      await repository.findById(db, [businessUnitId()], withoutFileId),
      'la declaración sin evidencia'
    )
    assert.isFalse(withoutFile.hasEvidence)

    // Cadena vacía: la columna tiene texto, pero no es evidencia.
    const emptyId = await insertDeclaration({ category: 'accessory', file: '' })
    assert.equal(await storedFile(emptyId), '')

    const empty = required(
      await repository.findById(db, [businessUnitId()], emptyId),
      'la declaración con cadena vacía'
    )
    assert.isFalse(empty.hasEvidence)
  })

  test('RF: findEvidencePath devuelve la ruta viva dentro del alcance, vigente o cerrada', async ({
    assert,
  }) => {
    const key = evidenceKey('c2.pdf')
    const withFileId = await insertDeclaration({ file: key })
    const withoutFileId = await insertDeclaration({ category: 'computing_equipment' })

    // Vigente con archivo: la ruta tal cual quedó escrita.
    assert.deepEqual(await repository.findEvidencePath([businessUnitId()], withFileId), {
      declarationId: withFileId,
      storedPath: key,
    })

    // Vigente sin archivo: la declaración existe, la evidencia no.
    assert.deepEqual(await repository.findEvidencePath([businessUnitId()], withoutFileId), {
      declarationId: withoutFileId,
      storedPath: null,
    })

    // Cerrada (regla 8): el cierre conserva la evidencia y la ruta sigue viva.
    await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', withFileId)
      .update({ employee_own_equipment_declaration_status: 'closed' })
    assert.deepEqual(await repository.findEvidencePath([businessUnitId()], withFileId), {
      declarationId: withFileId,
      storedPath: key,
    })

    // Ajena: el id de B con el alcance de A es indistinguible de inexistente.
    const foreignId = await insertDeclaration({
      employeeId: employeeIdB(),
      businessUnitId: businessUnitIdB(),
    })
    assert.isNull(await repository.findEvidencePath([businessUnitId()], foreignId))
    assert.isNull(await repository.findEvidencePath([businessUnitId()], 2_000_000_000))

    // Borrada lógicamente: fuera, aunque tenga archivo.
    const deletedId = await insertDeclaration({ category: 'accessory', file: key })
    await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', deletedId)
      .update({ employee_own_equipment_declaration_deleted_at: new Date() })
    assert.isNull(await repository.findEvidencePath([businessUnitId()], deletedId))
  })

  test('RF: las constantes fijan la carpeta y el prefijo de descarga de la evidencia', ({
    assert,
  }) => {
    assert.equal(OWN_EQUIPMENT_EVIDENCE_S3_FOLDER, 'own-equipment-declarations')
    assert.equal(ASSET_FILE_NAME_PREFIX.ownEquipmentEvidence, 'equipo-propio')
  })
})
