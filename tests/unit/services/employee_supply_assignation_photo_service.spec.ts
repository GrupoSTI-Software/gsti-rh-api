import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { cuid } from '@adonisjs/core/helpers'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import EmployeeSupplie from '#models/employee_supplie'
import EmployeeSupplieAssignationPhoto from '#models/employee_supplie_assignation_photo'
import Person from '#models/person'
import Supplie from '#models/supplie'
import SupplyType from '#models/supply_type'
import EmployeeSuppplyAssignamentPhotoService from '#services/employee_suppply_assignament_photo_service'
import { TenantContext } from '#utils/tenant_context'

/**
 * USRH1785766406719 — deletePhoto debe acotar por el insumo asignado padre.
 * Las unidades y empleados se crean temporalmente para no depender de semillas.
 */

function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

async function createBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = uniqueStamp()
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Fotos ${prefix} ${stamp}`
  businessUnit.businessUnitSlug = `fotos-${prefix}-${stamp}`
  businessUnit.businessUnitLegalName = `Fotos ${prefix} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

async function createEmployee(person: Person, businessUnit: BusinessUnit): Promise<Employee> {
  const stamp = uniqueStamp()
  const employee = new Employee()
  employee.employeeSyncId = Date.now()
  employee.employeeCode = `PHOTO-${stamp}`
  employee.employeeFirstName = person.personFirstname
  employee.employeeLastName = person.personLastname
  employee.employeeSecondLastName = person.personSecondLastname
  employee.employeePayrollNum = `PHOTO-${stamp}`
  employee.companyId = 1
  employee.personId = person.personId
  employee.businessUnitId = businessUnit.businessUnitId
  employee.payrollBusinessUnitId = businessUnit.businessUnitId
  employee.employeeTerminatedDate = null
  await employee.save()
  return employee
}

async function createPerson(prefix: string): Promise<Person> {
  const person = new Person()
  person.personFirstname = 'Prueba'
  person.personLastname = 'Fotos'
  person.personSecondLastname = prefix
  person.personEmail = `fotos-${prefix}-${uniqueStamp()}@gsti-tests.local`
  await person.save()
  return person
}

test.group('EmployeeSupplyAssignationPhotoService — aislamiento por tenant', (group) => {
  let supplyId: number
  let businessUnitOwn: BusinessUnit | null = null
  let businessUnitForeign: BusinessUnit | null = null
  let personOwn: Person | null = null
  let personForeign: Person | null = null
  let employeeOwn: Employee | null = null
  let employeeForeign: Employee | null = null
  let employeeSupplyForeignId: number
  let photoForeignId: number
  let createdSupplyId: number | null = null
  let createdSupplyTypeId: number | null = null

  group.setup(async () => {
    businessUnitOwn = await createBusinessUnit('propia')
    businessUnitForeign = await createBusinessUnit('foranea')
    personOwn = await createPerson('propia')
    personForeign = await createPerson('foranea')
    employeeOwn = await createEmployee(personOwn, businessUnitOwn)
    employeeForeign = await createEmployee(personForeign, businessUnitForeign)

    let catalogSupply = await Supplie.query().whereNull('supply_deleted_at').first()
    if (!catalogSupply) {
      const supplyType = await SupplyType.create({
        supplyTypeName: `Tipo de prueba ${cuid()}`,
        supplyTypeDescription: 'Tipo para pruebas de aislamiento',
        supplyTypeIdentifier: cuid(),
        supplyTypeSlug: `tipo-prueba-${cuid()}`,
      })
      createdSupplyTypeId = supplyType.supplyTypeId
      catalogSupply = await Supplie.create({
        supplyFileNumber: 900000000 + Math.floor(Math.random() * 99999999),
        supplyName: `Insumo de prueba ${cuid()}`,
        supplyDescription: 'Insumo para pruebas de aislamiento',
        supplyTypeId: supplyType.supplyTypeId,
        supplyStatus: 'active',
      })
      createdSupplyId = catalogSupply.supplyId
    }
    supplyId = catalogSupply.supplyId

    const employeeSupply = await TenantContext.run(
      [businessUnitForeign.businessUnitId],
      async () => {
        const row = new EmployeeSupplie()
        row.employeeId = employeeForeign!.employeeId
        row.businessUnitId = businessUnitForeign!.businessUnitId
        row.supplyId = supplyId
        row.employeeSupplyStatus = 'active'
        row.employeeSupplyAssignamentDate = DateTime.now()
        await row.save()
        return row
      }
    )
    employeeSupplyForeignId = employeeSupply.employeeSupplyId

    const photo = await TenantContext.runUnscoped(async () => {
      const p = new EmployeeSupplieAssignationPhoto()
      p.employeeSupplyId = employeeSupplyForeignId
      p.employeeSupplieAssignationPhotoType = 'assignation'
      p.employeeSupplieAssignationPhotoFile = `test/supply-photo-${cuid()}.jpg`
      await p.save()
      return p
    }, 'fixture foto insumos empresa foránea')
    photoForeignId = photo.employeeSupplieAssignationPhotoId
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (photoForeignId) {
        await EmployeeSupplieAssignationPhoto.query()
          .where('employeeSupplieAssignationPhotoId', photoForeignId)
          .delete()
      }
      if (employeeSupplyForeignId) {
        await EmployeeSupplie.query().where('employeeSupplyId', employeeSupplyForeignId).delete()
      }
      if (employeeOwn) {
        await Employee.query().where('employeeId', employeeOwn.employeeId).delete()
      }
      if (employeeForeign) {
        await Employee.query().where('employeeId', employeeForeign.employeeId).delete()
      }
      if (personOwn) {
        await Person.query().where('personId', personOwn.personId).delete()
      }
      if (personForeign) {
        await Person.query().where('personId', personForeign.personId).delete()
      }
      if (businessUnitOwn) {
        await BusinessUnit.query()
          .where('businessUnitId', businessUnitOwn.businessUnitId)
          .delete()
      }
      if (businessUnitForeign) {
        await BusinessUnit.query()
          .where('businessUnitId', businessUnitForeign.businessUnitId)
          .delete()
      }
      if (createdSupplyId) {
        await Supplie.query().where('supplyId', createdSupplyId).delete()
      }
      if (createdSupplyTypeId) {
        await SupplyType.query().where('supplyTypeId', createdSupplyTypeId).delete()
      }
    }, 'limpieza test fotos insumos')
  })

  test('getPhotosByType con contexto propio no ve insumo de otra empresa', async ({ assert }) => {
    const service = new EmployeeSuppplyAssignamentPhotoService()
    const result = await TenantContext.run([businessUnitOwn!.businessUnitId], () =>
      service.getPhotosByType(employeeSupplyForeignId, 'assignation')
    )

    assert.equal(result.status, 404)
    assert.equal(result.title, 'Employee supply not found')
    assert.isNull(result.data)
  })

  test('deletePhoto con contexto propio no borra foto de otra empresa', async ({ assert }) => {
    const service = new EmployeeSuppplyAssignamentPhotoService()
    const fakeUpload = {
      deleteFile: async () => {
        throw new Error('no debe llamar a S3 en borrado denegado')
      },
    }

    const result = await TenantContext.run([businessUnitOwn!.businessUnitId], () =>
      service.deletePhoto(photoForeignId, fakeUpload as any)
    )

    assert.equal(result.status, 404)
    assert.equal(result.title, 'Photo not found')

    const stillAlive = await TenantContext.runUnscoped(
      () =>
        EmployeeSupplieAssignationPhoto.query()
          .where('employeeSupplieAssignationPhotoId', photoForeignId)
          .whereNull('employee_supplie_assignation_photo_deleted_at')
          .first(),
      'verificación post-delete denegado'
    )
    assert.isNotNull(stillAlive)
  })

  test('getPhotosByType con contexto de la empresa sí lista la foto propia', async ({ assert }) => {
    const service = new EmployeeSuppplyAssignamentPhotoService()
    const result = await TenantContext.run([businessUnitForeign!.businessUnitId], () =>
      service.getPhotosByType(employeeSupplyForeignId, 'assignation')
    )

    assert.equal(result.status, 200)
    assert.isArray(result.data)
    assert.lengthOf(result.data as any[], 1)
  })
})
