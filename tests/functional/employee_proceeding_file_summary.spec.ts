import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import { toBusinessDateString, todayInBusinessZone } from '#utils/business_date'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'
import {
  assertPermissionDenied,
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  required,
  setModuleEnforcement,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * `GET /api/employees/:employeeId/proceeding-file-summary` contra la BD de
 * pruebas: árbol de carpetas del área con exclusivas y poda de subárbol,
 * conteos directos, borrado lógico, vencimientos y aislamiento por empresa.
 *
 * `employees` puede venir con la exigencia apagada de otros specs: se enciende
 * aquí y se restaura al terminar.
 */

const EMPLOYEES = 'employees'

interface SummaryFolderBody {
  proceedingFileTypeId: number
  documentsCount: number
  subfoldersCount: number
}

const dayOffset = (days: number) =>
  `${toBusinessDateString(todayInBusinessZone().plus({ days }))} 12:00:00`
const uniqueStamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

function getSummary(client: ApiClient, actor: TenantActor, employeeId: number) {
  return client
    .get(`/api/employees/${employeeId}/proceeding-file-summary`)
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
}

test.group('GET /api/employees/:employeeId/proceeding-file-summary', (group) => {
  let actor: TenantActor | null = null
  let otherActor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let otherFixture: EmployeeFixture | null = null
  let previousEnforcement = true
  const folderIds: number[] = []
  const proceedingFileIds: number[] = []
  const employeeProceedingFileIds: number[] = []
  const employeeFolderAssignmentIds: number[] = []
  const contractIds: number[] = []
  const folders: Record<'root' | 'general' | 'assigned' | 'notAssigned' | 'pruned', number> = {
    root: 0,
    general: 0,
    assigned: 0,
    notAssigned: 0,
    pruned: 0,
  }

  async function insertFolder(
    label: string,
    options: {
      parentId?: number
      exclusive?: boolean
      area?: string
      businessUnits?: string | null
    }
  ): Promise<number> {
    const now = new Date()
    const stamp = uniqueStamp()
    const [id] = await db.table('proceeding_file_types').insert({
      proceeding_file_type_name: `Resumen ${label} ${stamp}`,
      proceeding_file_type_slug: `resumen-${label}-${stamp}`,
      proceeding_file_type_area_to_use: options.area ?? 'employee',
      proceeding_file_type_active: 1,
      proceeding_file_type_business_units: options.businessUnits ?? null,
      parent_id: options.parentId ?? null,
      proceeding_file_type_is_exclusive: options.exclusive ?? false,
      proceeding_file_type_created_at: now,
      proceeding_file_type_updated_at: now,
    })
    folderIds.push(Number(id))
    return Number(id)
  }

  async function insertEmployeeFile(
    employeeFixture: EmployeeFixture,
    proceedingFileTypeId: number,
    options: { expiresAt?: string | null; active?: number; deletedLink?: boolean } = {}
  ): Promise<void> {
    const now = new Date()
    const stamp = uniqueStamp()
    const [fileId] = await db.table('proceeding_files').insert({
      proceeding_file_name: `resumen-${stamp}.pdf`,
      proceeding_file_path: `pruebas/resumen-${stamp}.pdf`,
      proceeding_file_type_id: proceedingFileTypeId,
      proceeding_file_expiration_at: options.expiresAt ?? null,
      proceeding_file_active: options.active ?? 1,
      proceeding_file_uuid: `pf-resumen-${stamp}`,
      proceeding_file_created_at: now,
      proceeding_file_updated_at: now,
    })
    proceedingFileIds.push(Number(fileId))
    const [linkId] = await db.table('employee_proceeding_files').insert({
      employee_id: employeeFixture.employee.employeeId,
      business_unit_id: employeeFixture.businessUnitId,
      proceeding_file_id: Number(fileId),
      employee_proceeding_file_created_at: now,
      employee_proceeding_file_updated_at: now,
      employee_proceeding_file_deleted_at: options.deletedLink ? now : null,
    })
    employeeProceedingFileIds.push(Number(linkId))
  }

  async function insertContract(employeeFixture: EmployeeFixture, deleted: boolean): Promise<void> {
    const now = new Date()
    const contractType = await db
      .from('employee_contract_types')
      .whereNull('employee_contract_type_deleted_at')
      .firstOrFail()
    const [id] = await db.table('employee_contracts').insert({
      employee_contract_folio: `CTR-RESUMEN-${uniqueStamp()}`,
      employee_contract_start_date: dayOffset(-365),
      employee_contract_type_id: contractType.employee_contract_type_id,
      employee_id: employeeFixture.employee.employeeId,
      business_unit_id: employeeFixture.businessUnitId,
      department_id: employeeFixture.employee.departmentId,
      position_id: employeeFixture.employee.positionId,
      payroll_business_unit_id: employeeFixture.businessUnitId,
      employee_contract_active: 1,
      employee_contract_created_at: now,
      employee_contract_deleted_at: deleted ? now : null,
    })
    contractIds.push(Number(id))
  }

  group.setup(async () => {
    previousEnforcement = await setModuleEnforcement(EMPLOYEES, true)
    actor = await createTenantActor('proceeding-summary')
    otherActor = await createTenantActor('proceeding-summary-other')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'proceeding-summary')
    otherFixture = await createEmployeeFixture(
      otherActor.businessUnit.businessUnitId,
      'proceeding-summary-other'
    )
    const businessUnitSlug = actor.businessUnit.businessUnitSlug

    folders.root = await insertFolder('raiz', { businessUnits: businessUnitSlug })
    folders.general = await insertFolder('general', { parentId: folders.root })
    folders.assigned = await insertFolder('asignada', { parentId: folders.root, exclusive: true })
    folders.notAssigned = await insertFolder('no-asignada', {
      parentId: folders.root,
      exclusive: true,
    })
    folders.pruned = await insertFolder('podada', { parentId: folders.notAssigned })
    // Fuera del árbol: otra área y otra empresa.
    const otherArea = await insertFolder('otra-area', {
      area: 'system-setting',
      businessUnits: businessUnitSlug,
    })
    const otherTenant = await insertFolder('otra-empresa', {
      businessUnits: otherActor.businessUnit.businessUnitSlug,
    })

    const [assignmentId] = await db.table('employee_proceeding_files_types').insert({
      employee_id: fixture.employee.employeeId,
      business_unit_id: fixture.businessUnitId,
      proceeding_file_type_id: folders.assigned,
      employee_proceeding_file_type_created_at: new Date(),
    })
    employeeFolderAssignmentIds.push(Number(assignmentId))

    await insertEmployeeFile(fixture, folders.root, { expiresAt: dayOffset(-5) })
    await insertEmployeeFile(fixture, folders.root, { expiresAt: dayOffset(90) })
    await insertEmployeeFile(fixture, folders.root, { expiresAt: dayOffset(-1), deletedLink: true })
    await insertEmployeeFile(fixture, folders.assigned, { expiresAt: dayOffset(10) })
    await insertEmployeeFile(fixture, folders.assigned, { expiresAt: dayOffset(-3), active: 0 })
    await insertEmployeeFile(fixture, folders.notAssigned, { expiresAt: dayOffset(-2) })
    await insertEmployeeFile(fixture, folders.pruned)
    await insertEmployeeFile(fixture, otherArea, { expiresAt: dayOffset(-2) })
    await insertEmployeeFile(fixture, otherTenant, { expiresAt: dayOffset(-2) })

    await insertContract(fixture, false)
    await insertContract(fixture, true)
  })

  group.teardown(async () => {
    try {
      await db.from('employee_contracts').whereIn('employee_contract_id', contractIds).delete()
      await db
        .from('employee_proceeding_files')
        .whereIn('employee_proceeding_file_id', employeeProceedingFileIds)
        .delete()
      await db.from('proceeding_files').whereIn('proceeding_file_id', proceedingFileIds).delete()
      await db
        .from('employee_proceeding_files_types')
        .whereIn('employee_proceeding_file_type_id', employeeFolderAssignmentIds)
        .delete()
      // Hijos antes que padres: `parent_id` apunta a la misma tabla.
      for (const id of [...folderIds].reverse()) {
        await db.from('proceeding_file_types').where('proceeding_file_type_id', id).delete()
      }
      await cleanupEmployeeFixture(fixture)
      await cleanupEmployeeFixture(otherFixture)
    } finally {
      await cleanupTenantActor(actor)
      await cleanupTenantActor(otherActor)
      await setModuleEnforcement(EMPLOYEES, previousEnforcement)
    }
  })

  test('sin tab-expediente-read el gate niega', async ({ client, assert }) => {
    const tenantActor = required(actor, 'actor')
    await grantModulePermissions(tenantActor, EMPLOYEES, [])

    const response = await getSummary(
      client,
      tenantActor,
      required(fixture, 'fixture').employee.employeeId
    )

    assertPermissionDenied(assert, response)
  })

  test('cuenta carpetas visibles, archivos directos, contratos y vencimientos', async ({
    client,
    assert,
  }) => {
    const tenantActor = required(actor, 'actor')
    await grantModulePermissions(tenantActor, EMPLOYEES, ['tab-expediente-read'])

    const response = await getSummary(
      client,
      tenantActor,
      required(fixture, 'fixture').employee.employeeId
    )

    assert.equal(response.status(), 200)
    const data = response.body().data
    assert.equal(data.windowDays, 30)
    // 2 en la raíz + 2 en la exclusiva asignada + 1 contrato vivo.
    assert.deepEqual(data.totals, { documents: 5, folders: 4, expiringOrExpired: 2 })
    assert.deepEqual(data.contracts, { documents: 1 })
    assert.deepEqual(data.folders as SummaryFolderBody[], [
      { proceedingFileTypeId: folders.root, documentsCount: 2, subfoldersCount: 2 },
      { proceedingFileTypeId: folders.general, documentsCount: 0, subfoldersCount: 0 },
      { proceedingFileTypeId: folders.assigned, documentsCount: 2, subfoldersCount: 0 },
    ])
  })

  test('un empleado de otra empresa responde 404 con key', async ({ client, assert }) => {
    const tenantActor = required(actor, 'actor')
    await grantModulePermissions(tenantActor, EMPLOYEES, ['tab-expediente-read'])

    const response = await getSummary(
      client,
      tenantActor,
      required(otherFixture, 'otherFixture').employee.employeeId
    )

    assert.equal(response.status(), 404)
    assert.equal(response.body().key, 'empleado-no-encontrado')
    assert.isString(response.body().title)
    assert.isString(response.body().detail)
  })
})
