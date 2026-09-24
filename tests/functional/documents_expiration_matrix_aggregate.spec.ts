import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import i18nManager from '@adonisjs/i18n/services/main'
import CertificationCategory from '#models/certification_category'
import Certification from '#models/certification'
import Department from '#models/department'
import Person from '#models/person'
import Position from '#models/position'
import Supplie from '#models/supplie'
import SupplyType from '#models/supply_type'
import SystemSetting from '#models/system_setting'
import UserService from '#services/user_service'
import { buildContractDocumentName } from '#modules/documents-expiration-matrix/documents_expiration_matrix.service'
import { TenantContext } from '#utils/tenant_context'
import { toBusinessDateString, todayInBusinessZone } from '#utils/business_date'
import { createDepartmentFixture } from '#tests/helpers/org_chart_fixtures'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  opaqueEmployeeSlug,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'
import {
  addRoleModulePermissions,
  assertModuleEnforced,
  assertPermissionDenied,
  businessUnitHeaders,
  cleanupTenantActor,
  cleanupUnitUser,
  createBypassUserInBusinessUnit,
  createTenantActor,
  grantModulePermissions,
  required,
  setModuleEnforcement,
  uniqueTestName,
  type TenantActor,
  type UnitUser,
} from '#tests/helpers/tenant_actor'

/**
 * `GET /api/documents-expiration-matrix` y `GET .../items/:key/file`: ventana
 * única de 30 días, orden, dueño empleado con puesto y departamento, fuente
 * sin permiso fuera y 404 de descarga sin archivo.
 *
 * Las fuentes con dueño empleado se acotan a los departamentos del rol: el
 * actor ve solo el departamento del empleado del fixture; `provider-folio`
 * sirve para la fuente sin permiso.
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
  targetId: number | null
  owner: {
    kind: string
    employeeSlug?: string | null
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

/** Matriz vista por un usuario prestado a la empresa del actor. */
function getMatrixAs(client: ApiClient, unitUser: UnitUser, actor: TenantActor) {
  return client.get(MATRIX_URL).loginAs(unitUser.user).headers(businessUnitHeaders(actor))
}

function getItemFile(client: ApiClient, actor: TenantActor, key: string) {
  return client
    .get(`${MATRIX_URL}/items/${key}/file`)
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
}

const uniqueSpecStamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

/** Número de inventario único (la columna es UNIQUE y de 9 dígitos a lo más). */
const uniqueSupplyFileNumber = () =>
  Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9))

/** Empleado extra de la empresa, insertado por tabla como en `employee_fixture`. */
interface ExtraEmployee {
  employeeId: number
  personId: number
}

async function insertExtraEmployee(
  businessUnitId: number,
  departmentId: number,
  positionId: number,
  label: string
): Promise<ExtraEmployee> {
  const person = await Person.create({
    personFirstname: 'Empleado',
    personLastname: 'Matriz',
    personSecondLastname: label,
    personEmail: `employee-${label}-${uniqueSpecStamp()}@gsti-tests.local`,
    businessUnitId,
  })
  const code = `EMP-${uniqueSpecStamp()}`.slice(0, 40)
  const [employeeId] = await db.table('employees').insert({
    employee_slug: opaqueEmployeeSlug(),
    employee_sync_id: code,
    employee_code: code,
    employee_first_name: 'Empleado',
    employee_last_name: 'Matriz',
    employee_second_last_name: label,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    payroll_business_unit_id: businessUnitId,
    department_id: departmentId,
    position_id: positionId,
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `employee-work-${label}-${uniqueSpecStamp()}@gsti-tests.local`,
    employee_created_at: new Date(),
  })
  return { employeeId: Number(employeeId), personId: person.personId }
}

/** Borra el empleado extra antes que el organigrama de su unidad. */
async function cleanupExtraEmployee(extra: ExtraEmployee | null): Promise<void> {
  if (!extra) return
  await db.from('employees').where('employee_id', extra.employeeId).delete()
  await Person.query().where('person_id', extra.personId).delete()
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
  /** Dueño de la empresa del actor, sin filas en `role_departments`. */
  let companyOwner: UnitUser | null = null
  /** Otra empresa con su propio departamento: el owner no debe alcanzarlo. */
  let foreignActor: TenantActor | null = null
  let foreignFixture: EmployeeFixture | null = null
  let supplyTypeId: number | null = null
  let supplyId: number | null = null
  let employeeSupplyId: number | null = null
  /** Ficha creada por el spec (la empresa del actor nace sin ella). */
  let createdSystemSettingId: number | null = null
  let companyFileTypeId: number | null = null
  let companyProceedingFileId: number | null = null
  let companyFileId: number | null = null
  /** Empleado de otro departamento de la misma empresa, fuera del rol del actor. */
  let otherDepartmentEmployee: ExtraEmployee | null = null
  let otherDepartmentCertificationId: number | null = null
  let otherDepartmentSupplyId: number | null = null
  let otherDepartmentEmployeeSupplyId: number | null = null

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

    // "Temporal" lo siembra `0009_employee_contract_type_seeder`: el nombre esperado es fijo.
    const contractType = await db
      .from('employee_contract_types')
      .whereNull('employee_contract_type_deleted_at')
      .where('employee_contract_type_name', 'Temporal')
      .firstOrFail()
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

    // Insumo asignado que vence en la ventana: su targetId es el tipo del insumo.
    const supplyType = await SupplyType.create({
      businessUnitId: actor.businessUnit.businessUnitId,
      supplyTypeName: uniqueTestName('Tipo matriz'),
      supplyTypeSlug: `tipo-insumo-matriz-${stamp}`,
    })
    supplyTypeId = supplyType.supplyTypeId
    const supply = await Supplie.create({
      businessUnitId: actor.businessUnit.businessUnitId,
      supplyFileNumber: Number(`${Date.now()}${Math.floor(Math.random() * 100)}`.slice(-9)),
      supplyName: uniqueTestName('Activo matriz'),
      supplyTypeId: supplyType.supplyTypeId,
      supplyStatus: 'active',
    })
    supplyId = supply.supplyId
    const [insertedEmployeeSupplyId] = await db.table('employee_supplies').insert({
      employee_id: fixture.employee.employeeId,
      business_unit_id: actor.businessUnit.businessUnitId,
      supply_id: supply.supplyId,
      employee_supply_status: 'active',
      employee_supply_expiration_date: dayOffset(7),
      employee_supply_created_at: now,
    })
    employeeSupplyId = Number(insertedEmployeeSupplyId)

    // Expediente de la empresa: su targetId es el tipo de expediente (la carpeta).
    const existingSetting = await SystemSetting.query()
      .where('business_unit_id', actor.businessUnit.businessUnitId)
      .first()
    const setting =
      existingSetting ??
      (await SystemSetting.create({
        businessUnitId: actor.businessUnit.businessUnitId,
        systemSettingTradeName: uniqueTestName('Empresa matriz'),
        systemSettingSidebarColor: '#111111',
        systemSettingActive: 1,
        systemSettingMonthlyConversionFactor: 30.4,
      }))
    if (!existingSetting) createdSystemSettingId = setting.systemSettingId
    const [insertedCompanyTypeId] = await db.table('proceeding_file_types').insert({
      proceeding_file_type_name: `Tipo empresa matriz ${stamp}`,
      proceeding_file_type_slug: `tipo-empresa-matriz-${stamp}`,
      proceeding_file_type_area_to_use: 'system-setting',
      proceeding_file_type_created_at: now,
      proceeding_file_type_updated_at: now,
    })
    companyFileTypeId = Number(insertedCompanyTypeId)
    const [insertedCompanyProceedingFileId] = await db.table('proceeding_files').insert({
      proceeding_file_name: `empresa-matriz-${stamp}.pdf`,
      proceeding_file_path: `pruebas/empresa-matriz-${stamp}.pdf`,
      proceeding_file_type_id: companyFileTypeId,
      proceeding_file_expiration_at: `${dayOffset(12)} 00:00:00`,
      proceeding_file_active: 1,
      proceeding_file_uuid: `pf-empresa-matriz-${stamp}`,
      proceeding_file_created_at: now,
      proceeding_file_updated_at: now,
    })
    companyProceedingFileId = Number(insertedCompanyProceedingFileId)
    const [insertedCompanyFileId] = await db.table('system_setting_proceeding_files').insert({
      system_setting_id: setting.systemSettingId,
      proceeding_file_id: companyProceedingFileId,
      system_setting_proceeding_file_created_at: now,
    })
    companyFileId = Number(insertedCompanyFileId)

    // Certificación y activo de un empleado de otro departamento: el rol del
    // actor no lo alcanza; el owner sí (todos los departamentos de su empresa).
    const otherDepartment = await createDepartmentFixture(
      actor.businessUnit.businessUnitId,
      'Departamento fuera del rol'
    )
    otherDepartmentEmployee = await insertExtraEmployee(
      actor.businessUnit.businessUnitId,
      otherDepartment.departmentId,
      required(fixture.employee.positionId, 'el puesto'),
      'otro-depto'
    )
    const [insertedOtherCertificationId] = await db.table('employee_certifications').insert({
      employee_id: otherDepartmentEmployee.employeeId,
      business_unit_id: actor.businessUnit.businessUnitId,
      certification_id: certificationIds[0],
      employee_certification_complied_at: dayOffset(-300),
      employee_certification_expires_at: dayOffset(4),
      employee_certification_document_url: null,
      employee_certification_created_at: now,
    })
    otherDepartmentCertificationId = Number(insertedOtherCertificationId)
    const otherSupply = await Supplie.create({
      businessUnitId: actor.businessUnit.businessUnitId,
      supplyFileNumber: uniqueSupplyFileNumber(),
      supplyName: uniqueTestName('Activo otro depto'),
      supplyTypeId: supplyType.supplyTypeId,
      supplyStatus: 'active',
    })
    otherDepartmentSupplyId = otherSupply.supplyId
    const [insertedOtherEmployeeSupplyId] = await db.table('employee_supplies').insert({
      employee_id: otherDepartmentEmployee.employeeId,
      business_unit_id: actor.businessUnit.businessUnitId,
      supply_id: otherSupply.supplyId,
      employee_supply_status: 'active',
      employee_supply_expiration_date: dayOffset(6),
      employee_supply_created_at: now,
    })
    otherDepartmentEmployeeSupplyId = Number(insertedOtherEmployeeSupplyId)

    companyOwner = await createBypassUserInBusinessUnit('owner', 'matriz-owner', actor.businessUnit.businessUnitId)
    foreignActor = await createTenantActor('matriz-ajena')
    foreignFixture = await createEmployeeFixture(foreignActor.businessUnit.businessUnitId, 'matriz-ajena')
  })

  group.teardown(async () => {
    try {
      if (otherDepartmentEmployeeSupplyId !== null) {
        await db.from('employee_supplies').where('employee_supply_id', otherDepartmentEmployeeSupplyId).delete()
      }
      if (otherDepartmentSupplyId !== null) {
        await db.from('supplies').where('supply_id', otherDepartmentSupplyId).delete()
      }
      if (otherDepartmentCertificationId !== null) {
        await db
          .from('employee_certifications')
          .where('employee_certification_id', otherDepartmentCertificationId)
          .delete()
      }
      await cleanupExtraEmployee(otherDepartmentEmployee)
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
      if (companyFileId !== null) {
        await db
          .from('system_setting_proceeding_files')
          .where('system_setting_proceeding_file_id', companyFileId)
          .delete()
      }
      if (companyProceedingFileId !== null) {
        await db.from('proceeding_files').where('proceeding_file_id', companyProceedingFileId).delete()
      }
      if (companyFileTypeId !== null) {
        await db.from('proceeding_file_types').where('proceeding_file_type_id', companyFileTypeId).delete()
      }
      if (createdSystemSettingId !== null) {
        await db.from('system_settings').where('system_setting_id', createdSystemSettingId).delete()
      }
      if (employeeSupplyId !== null) {
        await db.from('employee_supplies').where('employee_supply_id', employeeSupplyId).delete()
      }
      if (supplyId !== null) {
        await db.from('supplies').where('supply_id', supplyId).delete()
      }
      if (supplyTypeId !== null) {
        await db.from('supply_types').where('supply_type_id', supplyTypeId).delete()
      }
      await cleanupUnitUser(companyOwner)
      await cleanupEmployeeFixture(foreignFixture)
      await cleanupTenantActor(foreignActor)
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
    assert.equal(owner.employeeSlug, employee.employeeSlug, 'slug para enlazar al detalle')
    // Offsets creados en orden [30, -5, 31]: el primer item (-5) es el segundo.
    assert.equal(certificationItems[0].targetId, certificationIds[1], 'certificationId del panel')

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
    assert.equal(contract?.documentName, 'Contrato temporal', 'Contrato + tipo con inicial en minúscula')
    assert.equal(contract?.daysToExpire, -1)
    assert.isFalse(contract?.hasFile, 'el contrato no tiene archivo')

    await addRoleModulePermissions(tenant.role, EMPLOYEES, ['download-proceeding-files'])
    const withDownload = await getMatrix(client, tenant)
    const downloadable: MatrixItemBody[] = withDownload.body().data.items
    assert.isTrue(
      downloadable.find((item) => item.key === `employee-file-${employeeProceedingFileId}`)?.hasFile
    )
  })

  test('owner sin role_departments ve expediente y contrato de su empresa', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const ownerUser = required(companyOwner, 'el owner')
    const ownerRoleDepartments = await db
      .from('role_departments')
      .where('role_id', ownerUser.user.roleId)
      .whereNull('role_department_deleted_at')
      .count('* as total')
    assert.equal(Number(ownerRoleDepartments[0].total), 0, 'el owner no tiene departamentos asignados')

    const response = await getMatrixAs(client, ownerUser, tenant)
    response.assertStatus(200)
    const items: MatrixItemBody[] = response.body().data.items
    assert.exists(items.find((item) => item.key === `employee-file-${employeeProceedingFileId}`))
    assert.exists(items.find((item) => item.key === `employee-contract-${employeeContractId}`))
  })

  test('owner: departamentos de su empresa y nunca los de otra', async ({ assert }) => {
    const tenant = required(actor, 'el actor')
    const ownerUser = required(companyOwner, 'el owner')
    const ownDepartmentId = required(
      required(fixture, 'el empleado').employee.departmentId,
      'el departamento propio'
    )
    const foreignDepartmentId = required(
      required(foreignFixture, 'el empleado ajeno').employee.departmentId,
      'el departamento ajeno'
    )
    const userService = new UserService(i18nManager.locale('es'))

    const withTenant = await TenantContext.run([tenant.businessUnit.businessUnitId], () =>
      userService.getRoleDepartments(ownerUser.user.userId)
    )
    assert.include(withTenant, ownDepartmentId)
    assert.notInclude(withTenant, foreignDepartmentId)

    // Sin contexto de empresa (jobs, comandos) se acota a sus empresas asignadas.
    const withoutTenant = await userService.getRoleDepartments(ownerUser.user.userId)
    assert.include(withoutTenant, ownDepartmentId)
    assert.notInclude(withoutTenant, foreignDepartmentId)
  })

  test('certificación y activo: el rol limitado no ve otro departamento; el owner sí', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const ownerUser = required(companyOwner, 'el owner')
    const certificationKey = `certification-${otherDepartmentCertificationId}`
    const supplyKey = `supply-${otherDepartmentEmployeeSupplyId}`
    await grantModulePermissions(tenant, MATRIX, ['read'])
    await addRoleModulePermissions(tenant.role, EMPLOYEES, ['tab-certificaciones-read'])

    const limited = await getMatrix(client, tenant)
    limited.assertStatus(200)
    const limitedKeys = (limited.body().data.items as MatrixItemBody[]).map((item) => item.key)
    assert.notInclude(limitedKeys, certificationKey, 'certificación de otro departamento fuera')
    assert.notInclude(limitedKeys, supplyKey, 'activo de otro departamento fuera')
    assert.include(limitedKeys, `supply-${employeeSupplyId}`, 'el activo de su departamento sí')
    for (const key of [certificationKey, supplyKey]) {
      const download = await getItemFile(client, tenant, key)
      download.assertStatus(404)
      assert.equal(download.body().key, 'vencimiento-no-encontrado', `${key}: la descarga tampoco lo ve`)
    }

    const asOwner = await getMatrixAs(client, ownerUser, tenant)
    asOwner.assertStatus(200)
    const ownerKeys = (asOwner.body().data.items as MatrixItemBody[]).map((item) => item.key)
    assert.include(ownerKeys, certificationKey)
    assert.include(ownerKeys, supplyKey)
    // El owner sí resuelve la llave: responde que no hay archivo, no que no existe.
    const ownerDownload = await client
      .get(`${MATRIX_URL}/items/${supplyKey}/file`)
      .loginAs(ownerUser.user)
      .headers(businessUnitHeaders(tenant))
    ownerDownload.assertStatus(404)
    assert.equal(ownerDownload.body().key, 'archivo-no-encontrado')
  })

  test('nombre del contrato: sigla intacta, sin duplicar "Contrato" y en inglés', ({ assert }) => {
    const contractOfTypeIn = (locale: string) => (type: string) =>
      i18nManager.locale(locale).t('expiration_matrix_document_employee_contract_of_type', { type })

    const spanish = contractOfTypeIn('es')
    assert.equal(buildContractDocumentName('Temporal', spanish), 'Contrato temporal')
    assert.equal(
      buildContractDocumentName('Por tiempo indeterminado', spanish),
      'Contrato por tiempo indeterminado'
    )
    assert.equal(buildContractDocumentName('NOM-035', spanish), 'Contrato NOM-035', 'sigla sin tocar')
    assert.equal(buildContractDocumentName('contrato de obra', spanish), 'contrato de obra')
    assert.equal(buildContractDocumentName('CONTRATO Temporal', spanish), 'CONTRATO Temporal')
    assert.equal(buildContractDocumentName('Temporal', contractOfTypeIn('en')), 'temporal contract')
  })

  test('targetId: tipo del insumo y tipo del expediente de la empresa', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MATRIX, ['read'])

    const response = await getMatrix(client, tenant)
    response.assertStatus(200)
    const items: MatrixItemBody[] = response.body().data.items
    const supplyItem = items.find((item) => item.key === `supply-${employeeSupplyId}`)
    const companyItem = items.find((item) => item.key === `company-file-${companyFileId}`)

    assert.exists(supplyItem)
    assert.equal(supplyItem?.targetId, supplyTypeId, 'supplyTypeId para abrir /supplies por tipo')
    assert.exists(companyItem)
    assert.equal(companyItem?.targetId, companyFileTypeId, 'proceedingFileTypeId de la carpeta')
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

/** Llaves de los registros de un par viejo/nuevo del mismo dueño y tipo. */
interface SupersedePair {
  oldKey: string
  newKey: string
}

/** Par por fuente: `replaced` (el nuevo vence después) y `kept` (el nuevo vence antes). */
interface SupersedeCase {
  replaced: SupersedePair
  kept: SupersedePair
}

test.group('Matriz de vencimientos: tope por registro más nuevo', (group) => {
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let employeesEnforcementBefore = false
  /** Segundo empleado del mismo departamento: el tope de contratos es por empleado. */
  let sibling: ExtraEmployee | null = null
  let createdSystemSettingId: number | null = null
  const proceedingFileTypeIds: number[] = []
  const proceedingFileIds: number[] = []
  const employeeProceedingFileIds: number[] = []
  const companyFileIds: number[] = []
  const contractIds: number[] = []
  const supplyTypeIds: number[] = []
  const supplyIds: number[] = []
  const employeeSupplyIds: number[] = []
  const cases = new Map<string, SupersedeCase>()

  group.setup(async () => {
    await assertModuleEnforced(MATRIX)
    employeesEnforcementBefore = await setModuleEnforcement(EMPLOYEES, true)

    actor = await createTenantActor('matriz-tope')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'tope')
    const businessUnitId = actor.businessUnit.businessUnitId
    const employee = fixture.employee
    const now = new Date()

    await db.table('role_departments').insert({
      role_id: actor.role.roleId,
      department_id: employee.departmentId,
      role_department_created_at: now,
    })

    sibling = await insertExtraEmployee(
      businessUnitId,
      required(employee.departmentId, 'el departamento'),
      required(employee.positionId, 'el puesto'),
      'tope'
    )

    const insertProceedingFileType = async (area: 'employee' | 'system-setting') => {
      const stamp = uniqueSpecStamp()
      const [typeId] = await db.table('proceeding_file_types').insert({
        proceeding_file_type_name: `Tipo tope ${stamp}`,
        proceeding_file_type_slug: `tipo-tope-${stamp}`,
        proceeding_file_type_area_to_use: area,
        proceeding_file_type_created_at: now,
        proceeding_file_type_updated_at: now,
      })
      proceedingFileTypeIds.push(Number(typeId))
      return Number(typeId)
    }
    const insertProceedingFile = async (typeId: number, offset: number) => {
      const stamp = uniqueSpecStamp()
      const [fileId] = await db.table('proceeding_files').insert({
        proceeding_file_name: `tope-${stamp}.pdf`,
        proceeding_file_path: `pruebas/tope-${stamp}.pdf`,
        proceeding_file_type_id: typeId,
        proceeding_file_expiration_at: `${dayOffset(offset)} 00:00:00`,
        proceeding_file_active: 1,
        proceeding_file_uuid: `pf-tope-${stamp}`,
        proceeding_file_created_at: now,
        proceeding_file_updated_at: now,
      })
      proceedingFileIds.push(Number(fileId))
      return Number(fileId)
    }

    // Expediente del empleado: viejo vencido y nuevo, por tipo.
    const insertEmployeeFile = async (typeId: number, offset: number) => {
      const [linkId] = await db.table('employee_proceeding_files').insert({
        employee_id: employee.employeeId,
        business_unit_id: businessUnitId,
        proceeding_file_id: await insertProceedingFile(typeId, offset),
        employee_proceeding_file_created_at: now,
        employee_proceeding_file_updated_at: now,
      })
      employeeProceedingFileIds.push(Number(linkId))
      return `employee-file-${Number(linkId)}`
    }
    const employeePair = async (newOffset: number): Promise<SupersedePair> => {
      const typeId = await insertProceedingFileType('employee')
      const oldKey = await insertEmployeeFile(typeId, -5)
      return { oldKey, newKey: await insertEmployeeFile(typeId, newOffset) }
    }
    cases.set('employee-file', { replaced: await employeePair(10), kept: await employeePair(-10) })

    // Expediente de la empresa: misma ficha, mismo tipo.
    const existingSetting = await SystemSetting.query().where('business_unit_id', businessUnitId).first()
    const setting =
      existingSetting ??
      (await SystemSetting.create({
        businessUnitId,
        systemSettingTradeName: uniqueTestName('Empresa tope'),
        systemSettingSidebarColor: '#111111',
        systemSettingActive: 1,
        systemSettingMonthlyConversionFactor: 30.4,
      }))
    if (!existingSetting) createdSystemSettingId = setting.systemSettingId
    const insertCompanyFile = async (typeId: number, offset: number) => {
      const [companyFileId] = await db.table('system_setting_proceeding_files').insert({
        system_setting_id: setting.systemSettingId,
        proceeding_file_id: await insertProceedingFile(typeId, offset),
        system_setting_proceeding_file_created_at: now,
      })
      companyFileIds.push(Number(companyFileId))
      return `company-file-${Number(companyFileId)}`
    }
    const companyPair = async (newOffset: number): Promise<SupersedePair> => {
      const typeId = await insertProceedingFileType('system-setting')
      const oldKey = await insertCompanyFile(typeId, -5)
      return { oldKey, newKey: await insertCompanyFile(typeId, newOffset) }
    }
    cases.set('company-file', { replaced: await companyPair(10), kept: await companyPair(-10) })

    // Contratos: el tope es por empleado, sin importar el tipo de contrato.
    const contractTypes = await db
      .from('employee_contract_types')
      .whereNull('employee_contract_type_deleted_at')
      .orderBy('employee_contract_type_id')
      .limit(2)
    const insertContract = async (employeeId: number, typeIndex: number, offset: number) => {
      const contractType = contractTypes[typeIndex % contractTypes.length]
      const [contractId] = await db.table('employee_contracts').insert({
        employee_contract_folio: `CTR-TOPE-${uniqueSpecStamp()}`,
        employee_contract_start_date: `${dayOffset(-365)} 00:00:00`,
        employee_contract_end_date: `${dayOffset(offset)} 00:00:00`,
        employee_contract_type_id: contractType.employee_contract_type_id,
        employee_id: employeeId,
        business_unit_id: businessUnitId,
        department_id: employee.departmentId,
        position_id: employee.positionId,
        payroll_business_unit_id: businessUnitId,
        employee_contract_active: 1,
        employee_contract_created_at: now,
      })
      contractIds.push(Number(contractId))
      return `employee-contract-${Number(contractId)}`
    }
    const contractPair = async (employeeId: number, newOffset: number): Promise<SupersedePair> => {
      const oldKey = await insertContract(employeeId, 0, -5)
      return { oldKey, newKey: await insertContract(employeeId, 1, newOffset) }
    }
    cases.set('employee-contract', {
      replaced: await contractPair(employee.employeeId, 10),
      kept: await contractPair(sibling.employeeId, -10),
    })

    // Insumos: una asignación nueva del MISMO insumo sustituye a la anterior;
    // dos insumos distintos del mismo tipo (dos laptops) se conservan.
    const createSupply = async (typeId: number): Promise<number> => {
      const supply = await Supplie.create({
        businessUnitId,
        supplyFileNumber: uniqueSupplyFileNumber(),
        supplyName: uniqueTestName('Activo tope'),
        supplyTypeId: typeId,
        supplyStatus: 'active',
      })
      supplyIds.push(supply.supplyId)
      return supply.supplyId
    }
    const assignSupply = async (supplyId: number, offset: number) => {
      const [employeeSupplyId] = await db.table('employee_supplies').insert({
        employee_id: employee.employeeId,
        business_unit_id: businessUnitId,
        supply_id: supplyId,
        employee_supply_status: 'active',
        employee_supply_expiration_date: dayOffset(offset),
        employee_supply_created_at: now,
      })
      employeeSupplyIds.push(Number(employeeSupplyId))
      return `supply-${Number(employeeSupplyId)}`
    }
    const createSupplyType = async (): Promise<number> => {
      const supplyType = await SupplyType.create({
        businessUnitId,
        supplyTypeName: uniqueTestName('Tipo tope'),
        supplyTypeSlug: `tipo-insumo-tope-${uniqueSpecStamp()}`,
      })
      supplyTypeIds.push(supplyType.supplyTypeId)
      return supplyType.supplyTypeId
    }
    const sameSupplyTypeId = await createSupplyType()
    const renewedSupplyId = await createSupply(sameSupplyTypeId)
    const replacedSupply: SupersedePair = {
      oldKey: await assignSupply(renewedSupplyId, -5),
      newKey: await assignSupply(renewedSupplyId, 10),
    }
    const twoSuppliesTypeId = await createSupplyType()
    const firstSupplyKey = await assignSupply(await createSupply(twoSuppliesTypeId), -5)
    const keptSupply: SupersedePair = {
      oldKey: firstSupplyKey,
      newKey: await assignSupply(await createSupply(twoSuppliesTypeId), 10),
    }
    cases.set('supply', { replaced: replacedSupply, kept: keptSupply })
  })

  group.teardown(async () => {
    try {
      await db.from('employee_supplies').whereIn('employee_supply_id', employeeSupplyIds).delete()
      await db.from('supplies').whereIn('supply_id', supplyIds).delete()
      await db.from('supply_types').whereIn('supply_type_id', supplyTypeIds).delete()
      await db.from('employee_contracts').whereIn('employee_contract_id', contractIds).delete()
      await db
        .from('system_setting_proceeding_files')
        .whereIn('system_setting_proceeding_file_id', companyFileIds)
        .delete()
      await db
        .from('employee_proceeding_files')
        .whereIn('employee_proceeding_file_id', employeeProceedingFileIds)
        .delete()
      await db.from('proceeding_files').whereIn('proceeding_file_id', proceedingFileIds).delete()
      await db.from('proceeding_file_types').whereIn('proceeding_file_type_id', proceedingFileTypeIds).delete()
      if (createdSystemSettingId !== null) {
        await db.from('system_settings').where('system_setting_id', createdSystemSettingId).delete()
      }
      await cleanupExtraEmployee(sibling)
      await cleanupEmployeeFixture(fixture)
      await cleanupTenantActor(actor)
    } finally {
      await setModuleEnforcement(EMPLOYEES, employeesEnforcementBefore)
    }
  })

  /** Llaves visibles en la matriz para el actor con expediente leíble. */
  async function visibleKeys(client: ApiClient): Promise<string[]> {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MATRIX, ['read'])
    await addRoleModulePermissions(tenant.role, EMPLOYEES, ['tab-expediente-read'])

    const response = await getMatrix(client, tenant)
    response.assertStatus(200)
    return (response.body().data.items as MatrixItemBody[]).map((item) => item.key)
  }

  test('el registro más nuevo que vence después sustituye al viejo, también en la descarga', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const keys = await visibleKeys(client)

    for (const [source, { replaced }] of cases) {
      assert.include(keys, replaced.newKey, `${source}: el nuevo aparece`)
      assert.notInclude(keys, replaced.oldKey, `${source}: el viejo sustituido no aparece`)

      const download = await getItemFile(client, tenant, replaced.oldKey)
      download.assertStatus(404)
      assert.equal(download.body().key, 'vencimiento-no-encontrado', `${source}: la descarga tampoco lo ve`)
    }
  })

  test('un registro más nuevo que vence antes no sustituye: aparecen los dos', async ({
    client,
    assert,
  }) => {
    const keys = await visibleKeys(client)

    for (const [source, { kept }] of cases) {
      assert.include(keys, kept.oldKey, `${source}: el viejo sigue`)
      assert.include(keys, kept.newKey, `${source}: el nuevo también`)
    }
  })
})
