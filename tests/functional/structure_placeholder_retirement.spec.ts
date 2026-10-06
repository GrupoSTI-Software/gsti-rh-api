/**
 * Retiro de los registros de relleno de la estructura (USRH1788466831452).
 *
 * Los ids del relleno son filas de fixture. No se usa el 999 real.
 * El contrato de esta rama todavía es NOT NULL; el grupo lo vuelve anulable
 * solo durante la suite, que es la precondición de USRH1789328927648, y lo restaura al salir.
 */
import { readFileSync } from 'node:fs'
import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import NoticeService from '#services/notice_service'
import StructurePlaceholderRetirementService, {
  STRUCTURE_PLACEHOLDER_IDS,
  StructurePlaceholderRetirementError,
  type PlaceholderIds,
} from '#services/structure_placeholder_retirement_service'

type World = {
  a: number
  b: number
  ids: PlaceholderIds
  departmentX: number
  positionB: number
  people: number[]
}

const createdUnits: number[] = []

test.group('structure_placeholder_retirement', (group) => {
  let contractsWereNullable = true

  group.setup(async () => {
    const [rows] = await db.rawQuery(
      `SELECT COLUMN_NAME AS column_name, IS_NULLABLE AS is_nullable
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'employee_contracts'
         AND COLUMN_NAME IN ('department_id', 'position_id')`
    )
    const list = rows as Array<{ column_name: string; is_nullable: string }>
    contractsWereNullable = list.every((row) => row.is_nullable === 'YES')
    if (!contractsWereNullable) {
      await db.rawQuery(
        'ALTER TABLE employee_contracts MODIFY department_id INT UNSIGNED NULL, MODIFY position_id INT UNSIGNED NULL'
      )
    }
  })

  group.teardown(async () => {
    if (createdUnits.length > 0) {
      await db.from('employees').whereIn('business_unit_id', createdUnits).update({
        department_id: null,
        position_id: null,
        position_level_config_id: null,
      })
      await db.from('employee_contracts').whereIn('business_unit_id', createdUnits).delete()
      await db.from('notices').whereIn('business_unit_id', createdUnits).delete()
      await db.from('department_position').whereIn('business_unit_id', createdUnits).delete()
      await db.from('position_position_levels').whereIn('business_unit_id', createdUnits).delete()
      await db.from('employees').whereIn('business_unit_id', createdUnits).delete()
      await db.from('departments').whereIn('business_unit_id', createdUnits).update({
        parent_department_id: null,
      })
      await db.from('positions').whereIn('business_unit_id', createdUnits).delete()
      await db.from('departments').whereIn('business_unit_id', createdUnits).delete()
      await db.from('business_units').whereIn('business_unit_id', createdUnits).delete()
    }
    if (!contractsWereNullable) {
      await db.rawQuery(
        'ALTER TABLE employee_contracts MODIFY department_id INT UNSIGNED NOT NULL, MODIFY position_id INT UNSIGNED NOT NULL'
      )
    }
  })

  test('CA-01 inventario solo lee y no crea archivo', async ({ assert }) => {
    assert.deepEqual(STRUCTURE_PLACEHOLDER_IDS, { departmentId: 999, positionId: 999 })
    const world = await createWorld()
    const alive = await insertEmployee(world.a, world.ids.departmentId, world.ids.positionId)
    const retired = await insertEmployee(world.a, world.ids.departmentId, world.ids.positionId, {
      deleted: true,
    })
    await insertEmployee(world.b, world.ids.departmentId, world.ids.positionId)
    await insertContract(alive, world.a, world.ids.departmentId, world.ids.positionId)
    await insertLink(world.a, world.ids.departmentId, world.ids.positionId)
    await insertNotice(world.a, world.departmentX, world.ids.positionId, { scheduled: true })
    await insertNotice(world.a, world.departmentX, world.ids.positionId, { sent: true })
    const legacyDepartment = await insertDepartment(world.a, 'legacy', { deleted: true })
    await insertEmployee(world.a, legacyDepartment, world.positionB)
    const crossEmployee = await insertEmployee(world.a, world.departmentX, world.positionB)

    const service = buildService()
    const before = await countEmployees(alive)
    const inventory = await service.inventory(world.ids)

    assert.isTrue(inventory.contractStructureNullable)
    assert.isAbove(find(inventory.references, 'employees.department', world.a).total, 0)
    assert.isAbove(find(inventory.references, 'employees.department', world.a).alive ?? 0, 0)
    assert.isAbove(find(inventory.references, 'notices.position:unsent', world.a).total, 0)
    assert.isAbove(find(inventory.references, 'notices.position:sent', world.a).total, 0)
    assert.isAbove(find(inventory.references, 'legacy:employees.department', world.a).total, 0)
    assert.isAbove(find(inventory.references, 'cross:employees.position', world.a).total, 0)
    assert.equal(await countEmployees(alive), before)
    assert.equal(await countEmployees(retired), 1)
    assert.equal(await countEmployees(crossEmployee), 1)
    await destroyWorld(world)
  })

  test('CA-02 el retiro de A no toca B y guarda el respaldo dirigido', async ({ assert }) => {
    const world = await createWorld()
    const employeeA = await insertEmployee(world.a, world.ids.departmentId, world.ids.positionId)
    const employeeB = await insertEmployee(world.b, world.ids.departmentId, world.ids.positionId)
    const contractA = await insertContract(employeeA, world.a, world.ids.departmentId, world.ids.positionId)
    await insertLink(world.a, world.ids.departmentId, world.ids.positionId)
    const linkB = await insertLink(world.b, world.ids.departmentId, world.ids.positionId)

    const result = await buildService().retireForTenant(world.ids, world.a, {
      dryRun: false,
      backupRef: 'ensayo-01',
      includeContracts: false,
    })

    const employeeRow = await db.from('employees').where('employee_id', employeeA).first()
    const other = await db.from('employees').where('employee_id', employeeB).first()
    const contractRow = await db.from('employee_contracts').where('employee_contract_id', contractA).first()
    const link = await db.from('department_position').where('department_position_id', linkB).first()
    assert.isNull(employeeRow.department_id)
    assert.isNull(employeeRow.position_id)
    assert.equal(other.department_id, world.ids.departmentId)
    assert.isNull(contractRow.department_id)
    assert.isNull(contractRow.position_id)
    assert.exists(link)
    assert.isString(result.snapshotPath)
    const snapshot = JSON.parse(readFileSync(result.snapshotPath!, 'utf8'))
    assert.equal(snapshot.backupRef, 'ensayo-01')
    assert.equal(snapshot.rows.employees[0].department_id, world.ids.departmentId)
    await destroyWorld(world)
  })

  test('CA-03 solo los empleados vivos de A quedan sin el catálogo dado de baja', async ({ assert }) => {
    const world = await createWorld()
    const deletedDepartment = await insertDepartment(world.a, 'baja', { deleted: true })
    const deletedPosition = await insertPosition(world.a, 'baja', { deleted: true })
    const levelId = await insertLevel(world.a, deletedPosition)
    const alive = await insertEmployee(world.a, deletedDepartment, null)
    const gone = await insertEmployee(world.a, deletedDepartment, null, { deleted: true })
    const withLevel = await insertEmployee(world.a, null, deletedPosition, { levelId })
    const deletedDepartmentB = await insertDepartment(world.b, 'baja-b', { deleted: true })
    const other = await insertEmployee(world.b, deletedDepartmentB, null)

    await buildService().retireForTenant(world.ids, world.a, {
      dryRun: false,
      backupRef: 'ensayo-03',
      includeContracts: false,
    })

    const aliveRow = await employee(alive)
    const goneRow = await employee(gone)
    const withLevelRow = await employee(withLevel)
    const otherRow = await employee(other)
    assert.isNull(aliveRow.department_id)
    assert.equal(goneRow.department_id, deletedDepartment)
    assert.isNull(withLevelRow.position_id)
    assert.isNull(withLevelRow.position_level_config_id)
    assert.equal(otherRow.department_id, deletedDepartmentB)
    await destroyWorld(world)
  })

  test('CA-04 sin bandera el contrato con puesto dado de baja no cambia', async ({ assert }) => {
    const world = await createWorld()
    const deletedPosition = await insertPosition(world.a, 'hist', { deleted: true })
    const deletedPositionB = await insertPosition(world.b, 'hist-b', { deleted: true })
    const holder = await insertEmployee(world.a, world.departmentX, deletedPosition)
    const holderB = await insertEmployee(world.b, world.departmentX, deletedPositionB)
    const contractA = await insertContract(holder, world.a, world.departmentX, deletedPosition)
    const contractB = await insertContract(holderB, world.b, world.departmentX, deletedPositionB)

    await buildService().retireForTenant(world.ids, world.a, {
      dryRun: false,
      backupRef: 'ensayo-04',
      includeContracts: false,
    })

    const contractRowA = await contract(contractA)
    const contractRowB = await contract(contractB)
    assert.equal(contractRowA.position_id, deletedPosition)
    assert.equal(contractRowB.position_id, deletedPositionB)
    await destroyWorld(world)
  })

  test('CA-04 con bandera solo se vacía el contrato vivo de A', async ({ assert }) => {
    const world = await createWorld()
    const deletedPosition = await insertPosition(world.a, 'hist', { deleted: true })
    const deletedPositionB = await insertPosition(world.b, 'hist-b', { deleted: true })
    const holder = await insertEmployee(world.a, world.departmentX, deletedPosition)
    const holderB = await insertEmployee(world.b, world.departmentX, deletedPositionB)
    const contractA = await insertContract(holder, world.a, world.departmentX, deletedPosition)
    const contractB = await insertContract(holderB, world.b, world.departmentX, deletedPositionB)

    await buildService().retireForTenant(world.ids, world.a, {
      dryRun: false,
      backupRef: 'ensayo-04b',
      includeContracts: true,
    })

    const contractRowA = await contract(contractA)
    const contractRowB = await contract(contractB)
    assert.isNull(contractRowA.position_id)
    assert.equal(contractRowB.position_id, deletedPositionB)
    await destroyWorld(world)
  })

  test('CA-08 y CA-09 el ensayo no escribe y sin respaldo se rechaza', async ({ assert }) => {
    const world = await createWorld()
    const employeeId = await insertEmployee(world.a, world.ids.departmentId, world.ids.positionId)
    const dry = await buildService().retireForTenant(world.ids, world.a, {
      dryRun: true,
      backupRef: null,
      includeContracts: false,
    })
    assert.isNull(dry.snapshotPath)
    assert.isAbove(dry.changed.find((row) => row.reference === 'employees')?.total ?? 0, 0)
    const employeeBeforeReject = await employee(employeeId)
    assert.equal(employeeBeforeReject.department_id, world.ids.departmentId)

    try {
      await buildService().retireForTenant(world.ids, world.a, {
        dryRun: false,
        backupRef: null,
        includeContracts: false,
      })
      assert.fail('debía rechazar la escritura')
    } catch (error) {
      assert.instanceOf(error, StructurePlaceholderRetirementError)
      assert.equal((error as StructurePlaceholderRetirementError).key, 'falta-la-referencia-del-respaldo')
    }
    const employeeAfterReject = await employee(employeeId)
    assert.equal(employeeAfterReject.department_id, world.ids.departmentId)
    await destroyWorld(world)
  })

  test('CA-11 repetir el retiro no cambia nada ni crea otro archivo', async ({ assert }) => {
    const world = await createWorld()
    await insertEmployee(world.a, world.ids.departmentId, world.ids.positionId)
    const service = buildService()
    await service.retireForTenant(world.ids, world.a, {
      dryRun: false,
      backupRef: 'ensayo-11',
      includeContracts: false,
    })
    const second = await service.retireForTenant(world.ids, world.a, {
      dryRun: false,
      backupRef: 'ensayo-11',
      includeContracts: false,
    })
    assert.isNull(second.snapshotPath)
    assert.isTrue(second.changed.every((row) => row.total === 0))
    await destroyWorld(world)
  })

  test('CA-05 el aviso no enviado con puesto de relleno vuelve a borrador', async ({ assert }) => {
    const world = await createWorld()
    const scheduled = await insertNotice(world.a, world.departmentX, world.ids.positionId, {
      scheduled: true,
    })
    const draft = await insertNotice(world.a, world.departmentX, world.ids.positionId, {})
    const reason = i18nManager
      .locale(i18nManager.defaultLocale)
      .formatMessage('structure_placeholder_notice_demoted_reason')

    await buildService().retireForTenant(world.ids, world.a, {
      dryRun: false,
      backupRef: 'ensayo-05',
      includeContracts: false,
    })

    for (const noticeId of [scheduled, draft]) {
      const row = await db.from('notices').where('notice_id', noticeId).first()
      assert.isNull(row.notice_scheduled_at)
      assert.isNull(row.notice_position_id)
      assert.equal(row.notice_department_id, world.departmentX)
      assert.isNull(row.notice_sent_at)
      assert.equal(row.notice_schedule_error, reason)
    }
    const due = await db
      .from('notices')
      .whereNull('notice_deleted_at')
      .whereNull('notice_sent_at')
      .whereNotNull('notice_scheduled_at')
      .whereIn('notice_id', [scheduled, draft])
    assert.lengthOf(due, 0)
    await destroyWorld(world)
  })

  test('CA-06 el aviso ya enviado no cambia', async ({ assert }) => {
    const world = await createWorld()
    const sent = await insertNotice(world.a, world.departmentX, world.ids.positionId, { sent: true })
    const before = await db.from('notices').where('notice_id', sent).first()

    await buildService().retireForTenant(world.ids, world.a, {
      dryRun: false,
      backupRef: 'ensayo-06',
      includeContracts: false,
    })

    const after = await db.from('notices').where('notice_id', sent).first()
    assert.equal(String(after.notice_position_id), String(before.notice_position_id))
    assert.equal(String(after.notice_department_id), String(before.notice_department_id))
    assert.isNotNull(after.notice_sent_at)
    const inventory = await buildService().inventory(world.ids)
    assert.isAbove(find(inventory.references, 'notices.position:sent', world.a).total, 0)
    await destroyWorld(world)
  })

  test('CA-07 el aviso no enviado del departamento de relleno queda sin destinatarios', async ({
    assert,
  }) => {
    const world = await createWorld()
    const noticeId = await insertNotice(world.a, world.ids.departmentId, null, { scheduled: true })

    await buildService().retireForTenant(world.ids, world.a, {
      dryRun: false,
      backupRef: 'ensayo-07',
      includeContracts: false,
    })

    const row = await db.from('notices').where('notice_id', noticeId).first()
    assert.isNull(row.notice_department_id)
    assert.isNotNull(row.notice_scheduled_at)
    const recipients = await new NoticeService(
      i18nManager.locale(i18nManager.defaultLocale)
    ).resolveRecipientsByCriteria(
      {
        audience: 'department',
        departmentId: null,
        positionId: null,
        recipientEmployeeIds: [],
      },
      world.a,
      null
    )
    assert.lengthOf(recipients, 0)
    await destroyWorld(world)
  })

  test('CA-12 el cierre se detiene si queda un subdepartamento y no borra', async ({ assert }) => {
    const world = await createWorld()
    const child = await insertDepartment(world.a, 'hijo', { parentId: world.ids.departmentId })
    const role = await db.from('roles').select('role_id').first()
    const [roleDepartmentId] = await db.table('role_departments').insert({
      role_id: role.role_id,
      department_id: world.ids.departmentId,
      role_department_created_at: new Date(),
    })

    const result = await buildService().finalize(world.ids, {
      dryRun: false,
      backupRef: 'ensayo-12',
      includeContracts: false,
    })

    assert.isFalse(result.deleted)
    assert.isAbove(result.blocking.length, 0)
    assert.equal(
      result.blocking.some((row) => row.table === 'departments' && row.column === 'parent_department_id'),
      true
    )
    assert.exists(await db.from('departments').where('department_id', world.ids.departmentId).first())
    assert.exists(await db.from('positions').where('position_id', world.ids.positionId).first())
    assert.exists(await db.from('role_departments').where('role_department_id', roleDepartmentId).first())
    await db.from('departments').where('department_id', child).update({ parent_department_id: null })
    await db.from('role_departments').where('role_department_id', roleDepartmentId).delete()
    await destroyWorld(world)
  })

  test('CA-13 el cierre borra el relleno y la repetición informa que ya se retiró', async ({
    assert,
  }) => {
    const world = await createWorld()
    const service = buildService()
    const result = await service.finalize(world.ids, {
      dryRun: false,
      backupRef: 'ensayo-13',
      includeContracts: false,
    })
    assert.isTrue(result.deleted)
    assert.isString(result.snapshotPath)
    assert.notExists(await db.from('departments').where('department_id', world.ids.departmentId).first())
    assert.notExists(await db.from('positions').where('position_id', world.ids.positionId).first())

    const again = await service.finalize(world.ids, {
      dryRun: false,
      backupRef: 'ensayo-13',
      includeContracts: false,
    })
    assert.isTrue(again.alreadyRetired)
    assert.isFalse(again.deleted)
    world.ids = { departmentId: 0, positionId: 0 }
    await destroyWorld(world)
  })
})

function buildService(): StructurePlaceholderRetirementService {
  return new StructurePlaceholderRetirementService(i18nManager.locale(i18nManager.defaultLocale))
}

function find(
  rows: Array<{ reference: string; businessUnitId: number | null; total: number; alive: number | null }>,
  reference: string,
  businessUnitId: number
) {
  const row = rows.find((item) => item.reference === reference && item.businessUnitId === businessUnitId)
  if (!row) throw new Error(`Falta el conteo ${reference} de la empresa ${businessUnitId}`)
  return row
}

async function createWorld(): Promise<World> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const a = await BusinessUnit.create({
    businessUnitName: `Retiro A ${stamp}`,
    businessUnitSlug: `retiro-a-${stamp}`,
    businessUnitLegalName: `Retiro A ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const b = await BusinessUnit.create({
    businessUnitName: `Retiro B ${stamp}`,
    businessUnitSlug: `retiro-b-${stamp}`,
    businessUnitLegalName: `Retiro B ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  createdUnits.push(a.businessUnitId, b.businessUnitId)
  const fillerDepartment = await insertDepartment(a.businessUnitId, 'relleno-depto')
  const fillerPosition = await insertPosition(a.businessUnitId, 'relleno-puesto')
  const departmentX = await insertDepartment(a.businessUnitId, 'depto-x')
  const positionB = await insertPosition(b.businessUnitId, 'puesto-b')
  return {
    a: a.businessUnitId,
    b: b.businessUnitId,
    ids: { departmentId: fillerDepartment, positionId: fillerPosition },
    departmentX,
    positionB,
    people: [],
  }
}

async function insertDepartment(
  businessUnitId: number,
  label: string,
  options: { deleted?: boolean; parentId?: number } = {}
): Promise<number> {
  const now = new Date()
  const [id] = await db.table('departments').insert({
    department_sync_id: `${label}-${Date.now()}`,
    department_code: `${label}-${Date.now()}`.slice(0, 50),
    department_name: label,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_active: 1,
    parent_department_id: options.parentId ?? null,
    department_deleted_at: options.deleted ? now : null,
    department_created_at: now,
    department_updated_at: now,
  })
  return Number(id)
}

async function insertPosition(
  businessUnitId: number,
  label: string,
  options: { deleted?: boolean } = {}
): Promise<number> {
  const now = new Date()
  const [id] = await db.table('positions').insert({
    position_sync_id: `${label}-${Date.now()}`,
    position_code: `${label}-${Date.now()}`.slice(0, 50),
    position_name: label,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    position_active: 1,
    position_deleted_at: options.deleted ? now : null,
    position_created_at: now,
    position_updated_at: now,
  })
  return Number(id)
}

async function insertLevel(businessUnitId: number, positionId: number): Promise<number> {
  const [id] = await db.table('position_position_levels').insert({
    position_id: positionId,
    position_position_level_ad_hoc_name: 'Nivel',
    position_position_level_rank: 1,
    position_position_level_is_default: 0,
    position_position_level_active: 1,
    business_unit_id: businessUnitId,
    position_position_level_created_at: new Date(),
  })
  return Number(id)
}

async function insertEmployee(
  businessUnitId: number,
  departmentId: number | null,
  positionId: number | null,
  options: { deleted?: boolean; levelId?: number } = {}
): Promise<number> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const person = await Person.create({
    personFirstname: 'Retiro',
    personLastname: stamp,
    personSecondLastname: 'Prueba',
    personEmail: `retiro-${stamp}@example.test`,
  })
  const now = new Date()
  const [id] = await db.table('employees').insert({
    employee_sync_id: `RET-${stamp}`,
    employee_code: `RET-${stamp}`,
    employee_first_name: 'Retiro',
    employee_last_name: stamp,
    employee_second_last_name: 'Prueba',
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_id: departmentId,
    position_id: positionId,
    position_level_config_id: options.levelId ?? null,
    person_id: person.personId,
    employee_type_id: 1,
    payroll_business_unit_id: businessUnitId,
    employee_work_schedule: 'Onsite',
    employee_business_email: `retiro-work-${stamp}@example.test`,
    employee_deleted_at: options.deleted ? now : null,
    employee_created_at: now,
  })
  return Number(id)
}

async function insertContract(
  employeeId: number,
  businessUnitId: number,
  departmentId: number,
  positionId: number
): Promise<number> {
  const now = new Date()
  const [id] = await db.table('employee_contracts').insert({
    employee_id: employeeId,
    employee_contract_folio: `FOLIO-${employeeId}-${Date.now()}`,
    employee_contract_type_id: 1,
    employee_contract_monthly_net_salary: 10000,
    employee_contract_active: 1,
    employee_contract_start_date: '2024-01-01',
    business_unit_id: businessUnitId,
    payroll_business_unit_id: businessUnitId,
    department_id: departmentId,
    position_id: positionId,
    employee_contract_created_at: now,
    employee_contract_updated_at: now,
  })
  return Number(id)
}

async function insertLink(
  businessUnitId: number,
  departmentId: number,
  positionId: number
): Promise<number> {
  const [id] = await db.table('department_position').insert({
    department_id: departmentId,
    position_id: positionId,
    business_unit_id: businessUnitId,
    department_position_created_at: new Date(),
  })
  return Number(id)
}

async function insertNotice(
  businessUnitId: number,
  departmentId: number | null,
  positionId: number | null,
  options: { scheduled?: boolean; sent?: boolean } = {}
): Promise<number> {
  const now = new Date()
  const [id] = await db.table('notices').insert({
    notice_subject: 'Aviso de prueba',
    notice_description: 'Texto',
    notice_type: 'text',
    notice_audience: 'department',
    notice_sent_count: options.sent ? 1 : 0,
    notice_sent_at: options.sent ? now : null,
    notice_scheduled_at: options.scheduled ? now : null,
    notice_department_id: departmentId,
    notice_position_id: positionId,
    business_unit_id: businessUnitId,
    notice_created_at: now,
    notice_updated_at: now,
  })
  return Number(id)
}

async function employee(employeeId: number) {
  return db.from('employees').where('employee_id', employeeId).first()
}

async function contract(contractId: number) {
  return db.from('employee_contracts').where('employee_contract_id', contractId).first()
}

async function countEmployees(employeeId: number): Promise<number> {
  const rows = await db.from('employees').where('employee_id', employeeId)
  return rows.length
}

async function destroyWorld(world: World): Promise<void> {
  const departmentIds = [world.ids.departmentId, world.departmentX].filter((id) => id > 0)
  const positionIds = [world.ids.positionId, world.positionB].filter((id) => id > 0)
  await db.from('employees').whereIn('business_unit_id', [world.a, world.b]).update({
    department_id: null,
    position_id: null,
    position_level_config_id: null,
  })
  await db.from('employee_contracts').whereIn('business_unit_id', [world.a, world.b]).delete()
  await db.from('notices').whereIn('business_unit_id', [world.a, world.b]).delete()
  await db.from('department_position').whereIn('business_unit_id', [world.a, world.b]).delete()
  await db.from('position_position_levels').whereIn('business_unit_id', [world.a, world.b]).delete()
  await db.from('role_departments').whereIn('department_id', departmentIds).delete()
  const people = await db
    .from('employees')
    .whereIn('business_unit_id', [world.a, world.b])
    .select('person_id')
  await db.from('employees').whereIn('business_unit_id', [world.a, world.b]).delete()
  const personIds = people
    .map((row: { person_id: number | null }) => row.person_id)
    .filter((id): id is number => typeof id === 'number')
  if (personIds.length > 0) await db.from('people').whereIn('person_id', personIds).delete()
  await db.from('departments').whereIn('business_unit_id', [world.a, world.b]).update({
    parent_department_id: null,
  })
  await db.from('positions').whereIn('position_id', positionIds).delete()
  await db.from('departments').whereIn('department_id', departmentIds).delete()
  await db.from('departments').whereIn('business_unit_id', [world.a, world.b]).delete()
  await db.from('positions').whereIn('business_unit_id', [world.a, world.b]).delete()
  await db.from('business_units').whereIn('business_unit_id', [world.a, world.b]).delete()
}
