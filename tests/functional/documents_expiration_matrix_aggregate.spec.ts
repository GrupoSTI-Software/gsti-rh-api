import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import CertificationCategory from '#models/certification_category'
import Certification from '#models/certification'
import Department from '#models/department'
import Position from '#models/position'
import { toBusinessDateString, todayInBusinessZone } from '#utils/business_date'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'
import {
  addRoleModulePermissions,
  assertModuleEnforced,
  assertPermissionDenied,
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  required,
  setModuleEnforcement,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * `GET /api/documents-expiration-matrix` y `GET .../items/:key/file`: ventana
 * única de 30 días, orden, dueño empleado con puesto y departamento, fuente
 * sin permiso fuera y 404 de descarga sin archivo.
 *
 * La fuente de empleado que se prueba es `certification` (sin scope de
 * departamentos del rol); `provider-folio` sirve para la fuente sin permiso.
 * `employees` puede venir con la exigencia apagada de otros specs: se enciende
 * aquí y se restaura al terminar.
 */

const MATRIX = 'documents-expiration-matrix'
const EMPLOYEES = 'employees'
const REPSE_PROVIDERS = 'repse-providers'
const MATRIX_URL = '/api/documents-expiration-matrix'

interface MatrixItemBody {
  key: string
  source: string
  documentName: string
  expiresAt: string
  daysToExpire: number
  hasFile: boolean
  owner: {
    kind: string
    name: string
    positionName?: string | null
    departmentName?: string | null
    employeeCode?: string | null
  }
}

const dayOffset = (days: number) => toBusinessDateString(todayInBusinessZone().plus({ days }))

function getMatrix(client: ApiClient, actor: TenantActor) {
  return client.get(MATRIX_URL).loginAs(actor.user).headers(businessUnitHeaders(actor))
}

function getItemFile(client: ApiClient, actor: TenantActor, key: string) {
  return client
    .get(`${MATRIX_URL}/items/${key}/file`)
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
}

test.group('Matriz de vencimientos agregada', (group) => {
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let employeesEnforcementBefore = false
  const certificationIds: number[] = []
  /** Cumplimientos por desfase de días respecto de hoy. */
  const employeeCertificationIds = new Map<number, number>()
  let providerId: number | null = null
  let proceedingFileTypeId: number | null = null
  let proceedingFileId: number | null = null
  let employeeProceedingFileId: number | null = null
  let employeeContractId: number | null = null
  let roleDepartmentId: number | null = null
  let contractTypeName = ''

  group.setup(async () => {
    await assertModuleEnforced(MATRIX)
    employeesEnforcementBefore = await setModuleEnforcement(EMPLOYEES, true)

    actor = await createTenantActor('matriz-agregada')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'matriz')

    const category =
      (await CertificationCategory.query().where('certification_category_is_active', 1).first()) ??
      (await CertificationCategory.create({
        certificationCategoryName: uniqueTestName('Cat matriz'),
        certificationCategoryKey: `cat-matriz-${Date.now()}`,
        certificationCategoryIsActive: 1,
        certificationCategoryDisplayOrder: 999,
      }))

    // Una certificación por desfase: la regla toma el último cumplimiento por
    // par empleado-certificación, así que cada fecha necesita su propio par.
    for (const offset of [30, -5, 31]) {
      const certification = await Certification.create({
        categoryId: category.certificationCategoryId,
        certificationName: uniqueTestName(`Cert matriz ${offset}`),
        isExternal: false,
        renewalPeriodDays: 365,
      })
      certificationIds.push(certification.certificationId)

      const [employeeCertificationId] = await db.table('employee_certifications').insert({
        employee_id: fixture.employee.employeeId,
        business_unit_id: actor.businessUnit.businessUnitId,
        certification_id: certification.certificationId,
        employee_certification_complied_at: dayOffset(-300),
        employee_certification_expires_at: dayOffset(offset),
        employee_certification_document_url: null,
        employee_certification_created_at: new Date(),
      })
      employeeCertificationIds.set(offset, Number(employeeCertificationId))
    }

    const [insertedProviderId] = await db.table('proveedores_repse').insert({
      business_unit_id: actor.businessUnit.businessUnitId,
      proveedor_repse_razon_social: uniqueTestName('Proveedor matriz'),
      proveedor_repse_rfc: 'cifrado-de-prueba',
      proveedor_repse_rfc_hash: `hash-matriz-${Date.now()}`,
      proveedor_repse_folio: `REPSE-MATRIZ-${Date.now()}`,
      proveedor_repse_objeto_registrado: 'Servicios de prueba',
      proveedor_repse_folio_vencimiento: dayOffset(10),
    })
    providerId = Number(insertedProviderId)

    // Fuentes con scope de departamentos: el rol ve el departamento del empleado.
    const now = new Date()
    const [insertedRoleDepartmentId] = await db.table('role_departments').insert({
      role_id: actor.role.roleId,
      department_id: fixture.employee.departmentId,
      role_department_created_at: now,
    })
    roleDepartmentId = Number(insertedRoleDepartmentId)

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    const [insertedTypeId] = await db.table('proceeding_file_types').insert({
      proceeding_file_type_name: `Tipo matriz ${stamp}`,
      proceeding_file_type_slug: `tipo-matriz-${stamp}`,
      proceeding_file_type_area_to_use: 'employee',
      proceeding_file_type_created_at: now,
      proceeding_file_type_updated_at: now,
    })
    proceedingFileTypeId = Number(insertedTypeId)
    const [insertedFileId] = await db.table('proceeding_files').insert({
      proceeding_file_name: `matriz-${stamp}.pdf`,
      proceeding_file_path: `pruebas/matriz-${stamp}.pdf`,
      proceeding_file_type_id: proceedingFileTypeId,
      proceeding_file_expiration_at: `${dayOffset(3)} 00:00:00`,
      proceeding_file_active: 1,
      proceeding_file_uuid: `pf-matriz-${stamp}`,
      proceeding_file_created_at: now,
      proceeding_file_updated_at: now,
    })
    proceedingFileId = Number(insertedFileId)
    const [insertedLinkId] = await db.table('employee_proceeding_files').insert({
      employee_id: fixture.employee.employeeId,
      business_unit_id: actor.businessUnit.businessUnitId,
      proceeding_file_id: proceedingFileId,
      employee_proceeding_file_created_at: now,
      employee_proceeding_file_updated_at: now,
    })
    employeeProceedingFileId = Number(insertedLinkId)

    const contractType = await db.from('employee_contract_types').whereNull('employee_contract_type_deleted_at').firstOrFail()
    contractTypeName = contractType.employee_contract_type_name
    const [insertedContractId] = await db.table('employee_contracts').insert({
      employee_contract_folio: `CTR-MATRIZ-${stamp}`,
      employee_contract_start_date: `${dayOffset(-365)} 00:00:00`,
      employee_contract_end_date: `${dayOffset(-1)} 00:00:00`,
      employee_contract_type_id: contractType.employee_contract_type_id,
      employee_id: fixture.employee.employeeId,
      business_unit_id: actor.businessUnit.businessUnitId,
      department_id: fixture.employee.departmentId,
      position_id: fixture.employee.positionId,
      payroll_business_unit_id: actor.businessUnit.businessUnitId,
      employee_contract_active: 1,
      employee_contract_created_at: now,
    })
    employeeContractId = Number(insertedContractId)
  })

  group.teardown(async () => {
    try {
      if (employeeContractId !== null) {
        await db.from('employee_contracts').where('employee_contract_id', employeeContractId).delete()
      }
      if (employeeProceedingFileId !== null) {
        await db
          .from('employee_proceeding_files')
          .where('employee_proceeding_file_id', employeeProceedingFileId)
          .delete()
      }
      if (proceedingFileId !== null) {
        await db.from('proceeding_files').where('proceeding_file_id', proceedingFileId).delete()
      }
      if (proceedingFileTypeId !== null) {
        await db.from('proceeding_file_types').where('proceeding_file_type_id', proceedingFileTypeId).delete()
      }
      if (roleDepartmentId !== null) {
        await db.from('role_departments').where('role_department_id', roleDepartmentId).delete()
      }
      if (providerId !== null) {
        await db.from('proveedores_repse').where('proveedor_repse_id', providerId).delete()
      }
      await db
        .from('employee_certifications')
        .whereIn('employee_certification_id', [...employeeCertificationIds.values()])
        .delete()
      if (certificationIds.length > 0) {
        await db.from('business_unit_certifications').whereIn('certification_id', certificationIds).delete()
        await db.from('certifications').whereIn('certification_id', certificationIds).delete()
      }
      await cleanupEmployeeFixture(fixture)
      await cleanupTenantActor(actor)
    } finally {
      await setModuleEnforcement(EMPLOYEES, employeesEnforcementBefore)
    }
  })

  test('sin la matriz, la ruta responde PERM.DENIED', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MATRIX, [])

    assertPermissionDenied(assert, await getMatrix(client, tenant))
  })

  test('ventana de 30 días, orden por vencimiento y dueño con puesto y departamento', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const employee = required(fixture, 'el empleado').employee
    await grantModulePermissions(tenant, MATRIX, ['read'])
    await addRoleModulePermissions(tenant.role, EMPLOYEES, ['tab-certificaciones-read'])

    const response = await getMatrix(client, tenant)
    response.assertStatus(200)

    const data = response.body().data
    assert.equal(data.windowDays, 30)
    assert.equal(data.today, dayOffset(0))

    const items: MatrixItemBody[] = data.items
    const certificationItems = items.filter((item) => item.source === 'certification')
    assert.deepEqual(
      certificationItems.map((item) => item.key),
      [`certification-${employeeCertificationIds.get(-5)}`, `certification-${employeeCertificationIds.get(30)}`],
      'entran el vencido y el de hoy + 30, no el de hoy + 31, en orden ascendente'
    )
    assert.deepEqual(
      certificationItems.map((item) => item.daysToExpire),
      [-5, 30]
    )

    const expiresAt = items.map((item) => item.expiresAt)
    assert.deepEqual(expiresAt, [...expiresAt].sort(), 'items ordenados por expiresAt')

    const department = await Department.findOrFail(employee.departmentId)
    const position = await Position.findOrFail(employee.positionId)
    const owner = certificationItems[0].owner
    assert.equal(owner.kind, 'employee')
    assert.equal(owner.name, `${employee.employeeFirstName} ${employee.employeeLastName} ${employee.employeeSecondLastName}`)
    assert.equal(owner.positionName, position.positionName)
    assert.equal(owner.departmentName, department.departmentName)
    assert.equal(owner.employeeCode, String(employee.employeeCode))
    assert.isFalse(certificationItems[0].hasFile, 'sin documento no hay archivo')

    assert.notExists(
      items.find((item) => item.source === 'provider-folio'),
      'sin repse-providers el folio del proveedor no aparece'
    )
  })

  test('expediente y contrato: scope de departamentos del rol y archivo según permiso', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const employee = required(fixture, 'el empleado').employee
    await grantModulePermissions(tenant, MATRIX, ['read'])
    await addRoleModulePermissions(tenant.role, EMPLOYEES, ['tab-expediente-read'])

    const response = await getMatrix(client, tenant)
    response.assertStatus(200)
    const items: MatrixItemBody[] = response.body().data.items
    const file = items.find((item) => item.key === `employee-file-${employeeProceedingFileId}`)
    const contract = items.find((item) => item.key === `employee-contract-${employeeContractId}`)
    const department = await Department.findOrFail(employee.departmentId)

    assert.exists(file)
    assert.equal(file?.daysToExpire, 3)
    assert.equal(file?.owner.departmentName, department.departmentName)
    assert.isFalse(file?.hasFile, 'sin download-proceeding-files no se ofrece el archivo')
    assert.exists(contract)
    assert.equal(contract?.documentName, contractTypeName)
    assert.equal(contract?.daysToExpire, -1)
    assert.isFalse(contract?.hasFile, 'el contrato no tiene archivo')

    await addRoleModulePermissions(tenant.role, EMPLOYEES, ['download-proceeding-files'])
    const withDownload = await getMatrix(client, tenant)
    const downloadable: MatrixItemBody[] = withDownload.body().data.items
    assert.isTrue(
      downloadable.find((item) => item.key === `employee-file-${employeeProceedingFileId}`)?.hasFile
    )
  })

  test('una fuente sin permiso no aporta items y no tumba la matriz', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MATRIX, ['read'])

    const response = await getMatrix(client, tenant)
    response.assertStatus(200)
    const items: MatrixItemBody[] = response.body().data.items
    assert.notExists(items.find((item) => item.source === 'certification'))
  })

  test('con repse-providers read aparece el folio del proveedor', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MATRIX, ['read'])
    await addRoleModulePermissions(tenant.role, REPSE_PROVIDERS, ['read'])

    const response = await getMatrix(client, tenant)
    response.assertStatus(200)
    const items: MatrixItemBody[] = response.body().data.items
    const provider = items.find((item) => item.key === `provider-folio-${providerId}`)
    assert.exists(provider)
    assert.equal(provider?.owner.kind, 'provider')
    assert.equal(provider?.daysToExpire, 10)
    assert.isFalse(provider?.hasFile)
  })

  test('descarga: 404 sin archivo, 404 llave ajena y 422 llave mal formada', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MATRIX, ['read'])
    await addRoleModulePermissions(tenant.role, EMPLOYEES, ['tab-certificaciones-read'])

    const withoutFile = await getItemFile(client, tenant, `certification-${employeeCertificationIds.get(-5)}`)
    withoutFile.assertStatus(404)
    assert.equal(withoutFile.body().key, 'archivo-no-encontrado')

    const outOfWindow = await getItemFile(client, tenant, `certification-${employeeCertificationIds.get(31)}`)
    outOfWindow.assertStatus(404)
    assert.equal(outOfWindow.body().key, 'vencimiento-no-encontrado')

    const malformed = await getItemFile(client, tenant, 'desconocido-1')
    malformed.assertStatus(422)
    assert.equal(malformed.body().key, 'entrada-invalida')
  })
})
