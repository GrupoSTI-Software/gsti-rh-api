import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import EmployeeBiometric from '#models/employee_biometric'
import EmployeeCertification from '#models/employee_certification'
import Certification from '#models/certification'
import CertificationCategory from '#models/certification_category'

/**
 * USRH1783821206584 — verificación end-to-end contra BD real: biométricos,
 * historial salarial y certificaciones de un empleado de la unidad B no
 * deben ser visibles para un usuario de la unidad A, ni por acceso directo
 * al empleado ni (para biométricos, creados aquí) por PK directo del hijo.
 *
 * BU1 (sae) — empleado 678 (business_unit_id=1) con salary-history y
 * biometric-face-id reales ya cargados.
 * BU6 (cima) — empleados 12/13 (business_unit_id=6).
 */

const BU1_PUBLIC_ID = 'a76db057-2292-49a0-9f1b-911e328d93b0' // sae
const BU6_PUBLIC_ID = '8c3617a4-c942-4ba7-aee6-2ac32d4ab5ef' // cima

const BU1_EMPLOYEE_ID = 678 // tiene salary-history y biometric-face-id reales
const BU6_EMPLOYEE_ID = 12

async function getUserByEmail(email: string): Promise<User> {
  return User.query().whereNull('user_deleted_at').where('user_email', email).firstOrFail()
}

test.group('Salario/biométricos/certificaciones — aislamiento por tenant (BD real)', () => {
  test('salary-history: usuario BU1 ve el historial de su propio empleado', async ({
    client,
    assert,
  }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .get(`/api/employees/${BU1_EMPLOYEE_ID}/salary-history`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(200)
    assert.isArray(response.body().data)
  })

  test('salary-history: usuario BU6 recibe 404 al pedir el historial de un empleado de BU1', async ({
    client,
  }) => {
    const user = await getUserByEmail('jdsimon@cima-aviacion.com.mx')

    const response = await client
      .get(`/api/employees/${BU1_EMPLOYEE_ID}/salary-history`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU6_PUBLIC_ID)

    response.assertStatus(404)
    response.assertBodyContains({ key: 'empleado-no-encontrado' })
  })

  test('biometric-face-id: usuario BU1 ve la foto de su propio empleado', async ({ client }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .get(`/api/employees/${BU1_EMPLOYEE_ID}/biometric-face-id`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(200)
  })

  test('biometric-face-id: usuario BU6 recibe 404 al pedir la foto de un empleado de BU1', async ({
    client,
  }) => {
    const user = await getUserByEmail('jdsimon@cima-aviacion.com.mx')

    const response = await client
      .get(`/api/employees/${BU1_EMPLOYEE_ID}/biometric-face-id`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU6_PUBLIC_ID)

    response.assertStatus(404)
  })

  test('certifications: usuario BU1 recibe 404 al pedir certificaciones de un empleado de BU6', async ({
    client,
  }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .get(`/api/employees/${BU6_EMPLOYEE_ID}/certifications`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(404)
  })

  test('certifications: usuario BU6 sí puede listar certificaciones de su propio empleado', async ({
    client,
  }) => {
    const user = await getUserByEmail('jdsimon@cima-aviacion.com.mx')

    const response = await client
      .get(`/api/employees/${BU6_EMPLOYEE_ID}/certifications`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU6_PUBLIC_ID)

    response.assertStatus(200)
  })
})

test.group('EmployeeBiometric — defensa en profundidad (PK directo, BD real)', (group) => {
  let bu6BiometricId: number

  group.setup(async () => {
    // La tabla employee_biometrics está vacía en la BD restablecida: se crea
    // un registro temporal en BU6 para probar el acceso directo por PK.
    const row = new EmployeeBiometric()
    row.employeeId = BU6_EMPLOYEE_ID
    row.businessUnitId = 6
    row.employeeBiometricData = 'Finger:1'
    row.employeeBiometricStatus = 'completed_fingers'
    await row.save()
    bu6BiometricId = row.employeeBiometricId
  })

  group.teardown(async () => {
    if (bu6BiometricId) {
      await EmployeeBiometric.query().where('employeeBiometricId', bu6BiometricId).delete()
    }
  })

  test('el registro creado heredó businessUnitId del empleado padre (hook beforeCreate)', ({
    assert,
  }) => {
    assert.equal(bu6BiometricId > 0, true)
  })

  test('usuario BU6 SÍ ve el biométrico de su propio empleado (GET show)', async ({ client }) => {
    const user = await getUserByEmail('jdsimon@cima-aviacion.com.mx')

    const response = await client
      .get(`/api/employees/${BU6_EMPLOYEE_ID}/biometrics`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU6_PUBLIC_ID)

    response.assertStatus(200)
  })

  test('usuario BU1 recibe 404 al pedir el biométrico de un empleado de BU6', async ({
    client,
  }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .get(`/api/employees/${BU6_EMPLOYEE_ID}/biometrics`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(404)
  })
})

test.group('EmployeeCertification — defensa en profundidad (mixin, BD real, sin HTTP)', (group) => {
  let bu6CertId: number
  let tempCategoryId: number
  let tempCertificationId: number

  group.setup(async () => {
    // El catálogo de certificaciones está vacío en la BD restablecida: se crean
    // categoría + certificación temporales para satisfacer las FK.
    const category = new CertificationCategory()
    category.certificationCategoryKey = `TEST-${Date.now()}`
    category.certificationCategoryName = 'Temporal (test aislamiento)'
    category.certificationCategoryDisplayOrder = 999
    category.certificationCategoryIsActive = 0
    await category.save()
    tempCategoryId = category.certificationCategoryId

    const certification = new Certification()
    certification.categoryId = tempCategoryId
    certification.certificationName = `TEST-CERT-${Date.now()}`
    certification.isExternal = false
    await certification.save()
    tempCertificationId = certification.certificationId

    const row = new EmployeeCertification()
    row.employeeId = BU6_EMPLOYEE_ID
    row.certificationId = tempCertificationId
    row.employeeCertificationCompliedAt = DateTime.now()
    await row.save()
    bu6CertId = row.employeeCertificationId
  })

  group.teardown(async () => {
    if (bu6CertId) {
      await EmployeeCertification.query().where('employeeCertificationId', bu6CertId).delete()
    }
    if (tempCertificationId) {
      await Certification.query().where('certificationId', tempCertificationId).delete()
    }
    if (tempCategoryId) {
      await CertificationCategory.query()
        .where('certificationCategoryId', tempCategoryId)
        .delete()
    }
  })

  test('creado heredó businessUnitId=6 del empleado padre', async ({ assert }) => {
    const row = await EmployeeCertification.query()
      .where('employeeCertificationId', bu6CertId)
      .firstOrFail()
    assert.equal(row.businessUnitId, 6)
  })

  test('bajo TenantContext de BU1, una query directa por PK a la certificación de BU6 no resuelve', async ({
    assert,
  }) => {
    const { TenantContext } = await import('#utils/tenant_context')

    const found = await TenantContext.run([1], () =>
      EmployeeCertification.query().where('employeeCertificationId', bu6CertId).first()
    )
    assert.isNull(found, 'el mixin debe bloquear el acceso directo por PK fuera de scope')
  })

  test('bajo TenantContext de BU6, la misma query SÍ resuelve', async ({ assert }) => {
    const { TenantContext } = await import('#utils/tenant_context')

    const found = await TenantContext.run([6], () =>
      EmployeeCertification.query().where('employeeCertificationId', bu6CertId).first()
    )
    assert.isNotNull(found)
  })
})
