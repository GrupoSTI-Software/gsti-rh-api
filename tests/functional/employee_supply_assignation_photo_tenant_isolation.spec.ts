import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { cuid } from '@adonisjs/core/helpers'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import EmployeeSupplie from '#models/employee_supplie'
import EmployeeSupplieAssignationPhoto from '#models/employee_supplie_assignation_photo'
import Supplie from '#models/supplie'
import SupplyType from '#models/supply_type'
import { TenantContext } from '#utils/tenant_context'

const ROOT_ROLE_ID = 3

interface TestActor {
  user: User
  person: Person
}

function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

async function createTestActor(roleId: number, emailPrefix: string): Promise<TestActor> {
  const stamp = uniqueStamp()
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const person = new Person()
  person.personFirstname = 'Insumos'
  person.personLastname = 'Aislamiento'
  person.personSecondLastname = emailPrefix
  person.personEmail = email
  await person.save()

  const user = new User()
  user.userEmail = email
  user.userPassword = 'EmployeeSupplyPhotoTest123!'
  user.userActive = 1
  user.roleId = roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  return { user, person }
}

async function cleanupTestActor(actor: TestActor | null) {
  if (!actor) return
  await actor.user.related('businessUnits').detach()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
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

test.group('Fotos de insumos — aislamiento HTTP por tenant', (group) => {
  let root: TestActor | null = null
  let businessUnitOwn: BusinessUnit | null = null
  let businessUnitForeign: BusinessUnit | null = null
  let employeeOwn: Employee | null = null
  let employeeForeign: Employee | null = null
  let employeeSupplyOwnId: number
  let employeeSupplyForeignId: number
  let photoOwnAssignationId: number
  let photoForeignAssignationId: number
  let photoForeignReturnId: number
  let createdSupplyId: number | null = null
  let createdSupplyTypeId: number | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-supply-photo')
    businessUnitOwn = await createBusinessUnit('propia')
    businessUnitForeign = await createBusinessUnit('foranea')
    employeeOwn = await createEmployee(root.person, businessUnitOwn)
    employeeForeign = await createEmployee(root.person, businessUnitForeign)

    let catalogSupply = await Supplie.query().whereNull('supply_deleted_at').first()
    if (!catalogSupply) {
      const supplyType = await SupplyType.create({
        supplyTypeName: `Tipo de prueba ${cuid()}`,
        supplyTypeDescription: 'Tipo para pruebas de aislamiento HTTP',
        supplyTypeIdentifier: cuid(),
        supplyTypeSlug: `tipo-prueba-${cuid()}`,
      })
      createdSupplyTypeId = supplyType.supplyTypeId
      catalogSupply = await Supplie.create({
        supplyFileNumber: 900000000 + Math.floor(Math.random() * 99999999),
        supplyName: `Insumo de prueba ${cuid()}`,
        supplyDescription: 'Insumo para pruebas de aislamiento HTTP',
        supplyTypeId: supplyType.supplyTypeId,
        supplyStatus: 'active',
      })
      createdSupplyId = catalogSupply.supplyId
    }

    const ownSupply = await TenantContext.run([businessUnitOwn.businessUnitId], async () => {
      const row = new EmployeeSupplie()
      row.employeeId = employeeOwn!.employeeId
      row.businessUnitId = businessUnitOwn!.businessUnitId
      row.supplyId = catalogSupply!.supplyId
      row.employeeSupplyStatus = 'active'
      row.employeeSupplyAssignamentDate = DateTime.now()
      await row.save()
      return row
    })
    employeeSupplyOwnId = ownSupply.employeeSupplyId

    const foreignSupply = await TenantContext.run(
      [businessUnitForeign.businessUnitId],
      async () => {
        const row = new EmployeeSupplie()
        row.employeeId = employeeForeign!.employeeId
        row.businessUnitId = businessUnitForeign!.businessUnitId
        row.supplyId = catalogSupply!.supplyId
        row.employeeSupplyStatus = 'active'
        row.employeeSupplyAssignamentDate = DateTime.now()
        await row.save()
        return row
      }
    )
    employeeSupplyForeignId = foreignSupply.employeeSupplyId

    const photos = await TenantContext.runUnscoped(async () => {
      const own = new EmployeeSupplieAssignationPhoto()
      own.employeeSupplyId = employeeSupplyOwnId
      own.employeeSupplieAssignationPhotoType = 'assignation'
      own.employeeSupplieAssignationPhotoFile = `test/supply-own-${cuid()}.jpg`
      await own.save()

      const foreignAssignation = new EmployeeSupplieAssignationPhoto()
      foreignAssignation.employeeSupplyId = employeeSupplyForeignId
      foreignAssignation.employeeSupplieAssignationPhotoType = 'assignation'
      foreignAssignation.employeeSupplieAssignationPhotoFile = `test/supply-foreign-a-${cuid()}.jpg`
      await foreignAssignation.save()

      const foreignReturn = new EmployeeSupplieAssignationPhoto()
      foreignReturn.employeeSupplyId = employeeSupplyForeignId
      foreignReturn.employeeSupplieAssignationPhotoType = 'return'
      foreignReturn.employeeSupplieAssignationPhotoFile = `test/supply-foreign-r-${cuid()}.jpg`
      await foreignReturn.save()

      return { own, foreignAssignation, foreignReturn }
    }, 'fixtures fotos insumos HTTP')

    photoOwnAssignationId = photos.own.employeeSupplieAssignationPhotoId
    photoForeignAssignationId = photos.foreignAssignation.employeeSupplieAssignationPhotoId
    photoForeignReturnId = photos.foreignReturn.employeeSupplieAssignationPhotoId
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      for (const id of [photoOwnAssignationId, photoForeignAssignationId, photoForeignReturnId]) {
        if (id) {
          await EmployeeSupplieAssignationPhoto.query()
            .where('employeeSupplieAssignationPhotoId', id)
            .delete()
        }
      }
      for (const id of [employeeSupplyOwnId, employeeSupplyForeignId]) {
        if (id) await EmployeeSupplie.query().where('employeeSupplyId', id).delete()
      }
      if (employeeOwn) await Employee.query().where('employeeId', employeeOwn.employeeId).delete()
      if (employeeForeign) {
        await Employee.query().where('employeeId', employeeForeign.employeeId).delete()
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
      if (createdSupplyId) await Supplie.query().where('supplyId', createdSupplyId).delete()
      if (createdSupplyTypeId) {
        await SupplyType.query().where('supplyTypeId', createdSupplyTypeId).delete()
      }
    }, 'limpieza test fotos insumos HTTP')
    await cleanupTestActor(root)
  })

  test('sin header X-Business-Unit-Id responde 400 BU.VAL.000', async ({ client, assert }) => {
    const response = await client
      .get(`/api/employee-supply-assignation-photos/${employeeSupplyOwnId}/assignation`)
      .loginAs(root!.user)
    response.assertStatus(400)
    assert.equal(response.body().key, 'BU.VAL.000')
  })

  test('GET assignation de insumo ajeno responde 404 sin datos', async ({ client, assert }) => {
    const response = await client
      .get(`/api/employee-supply-assignation-photos/${employeeSupplyForeignId}/assignation`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitOwn!.businessUnitPublicId)
    response.assertStatus(404)
    assert.equal(response.body().title, 'Employee supply not found')
    assert.isNull(response.body().data)
  })

  test('GET return de insumo ajeno responde 404', async ({ client, assert }) => {
    const response = await client
      .get(`/api/employee-supply-assignation-photos/${employeeSupplyForeignId}/return`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitOwn!.businessUnitPublicId)
    response.assertStatus(404)
    assert.equal(response.body().title, 'Employee supply not found')
  })

  test('DELETE de foto ajena responde 404 y conserva la foto', async ({ client, assert }) => {
    const response = await client
      .delete(`/api/employee-supply-assignation-photos/${photoForeignAssignationId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitOwn!.businessUnitPublicId)
    response.assertStatus(404)
    assert.equal(response.body().title, 'Photo not found')

    const stillAlive = await TenantContext.runUnscoped(
      () =>
        EmployeeSupplieAssignationPhoto.query()
          .where('employeeSupplieAssignationPhotoId', photoForeignAssignationId)
          .whereNull('employee_supplie_assignation_photo_deleted_at')
          .first(),
      'verificación post-delete HTTP'
    )
    assert.isNotNull(stillAlive)
  })

  test('la empresa propia ve solo su foto de assignation', async ({ client, assert }) => {
    const response = await client
      .get(`/api/employee-supply-assignation-photos/${employeeSupplyOwnId}/assignation`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitOwn!.businessUnitPublicId)
    response.assertStatus(200)
    const ids = (response.body().data as any[]).map(
      (photo) => photo.employeeSupplieAssignationPhotoId
    )
    assert.include(ids, photoOwnAssignationId)
    assert.notInclude(ids, photoForeignAssignationId)
  })

  test('la otra empresa ve sus fotos de assignation y return', async ({ client, assert }) => {
    const assignation = await client
      .get(`/api/employee-supply-assignation-photos/${employeeSupplyForeignId}/assignation`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitForeign!.businessUnitPublicId)
    assignation.assertStatus(200)
    assert.include(
      (assignation.body().data as any[]).map((photo) => photo.employeeSupplieAssignationPhotoId),
      photoForeignAssignationId
    )

    const returned = await client
      .get(`/api/employee-supply-assignation-photos/${employeeSupplyForeignId}/return`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitForeign!.businessUnitPublicId)
    returned.assertStatus(200)
    assert.include(
      (returned.body().data as any[]).map((photo) => photo.employeeSupplieAssignationPhotoId),
      photoForeignReturnId
    )
  })
})
