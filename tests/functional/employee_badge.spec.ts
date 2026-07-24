import { test } from '@japa/runner'
import { ApiClient } from '@japa/api-client'
import { DateTime } from 'luxon'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import RepseRegistration from '#models/repse_registration'

/**
 * Tests funcionales — módulo "Gafete del empleado" (USRH1784686362321):
 * E1 (`GET /:employeeId`), E2 (`GET /:employeeId/pdf`), E3 (`GET /me`) y E4
 * (`GET /api/public/employee-badge/verify/:token`).
 *
 * Convenciones (espejo `repse_providers.spec.ts`):
 *  - Fixtures con timestamp único, sin transacciones, cleanup explícito en `group.teardown`.
 *  - `root` para el flujo feliz y aislamiento cross-tenant (sin permiso de módulo propio,
 *    E1/E2/E3 solo requieren `auth()` + `businessScope()` — cualquier rol autenticado sirve).
 *
 * Nota sobre el rate-limit de E4 (10 req/min/IP, store `memory` — persiste
 * durante todo el proceso de tests): la verificación pública se prueba en un
 * único test (`EmployeeBadge - verificación pública (E4)`) que encadena TODAS
 * las llamadas a esa ruta (payload, formato inválido, inexistente, vínculo no
 * vigente y el 429 al superar el límite). Ningún otro test del archivo toca
 * esa ruta, para no contaminar el contador compartido por IP.
 */

const ROOT_ROLE_ID = 3

function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

interface TestActor {
  user: User
  person: Person
}

async function createTestActor(roleId: number, emailPrefix: string): Promise<TestActor> {
  const stamp = uniqueStamp()
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'Gafete'
  person.personLastname = 'Test'
  person.personSecondLastname = emailPrefix
  person.personEmail = email
  await person.save()

  const user = new User()
  user.userEmail = email
  user.userPassword = 'EmployeeBadgeTest123!'
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

async function createBusinessUnit(prefix: string, active: number = 1): Promise<BusinessUnit> {
  const stamp = uniqueStamp()
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Gafete ${prefix} ${stamp}`
  businessUnit.businessUnitSlug = `gafete-${prefix}-${stamp}`
  businessUnit.businessUnitLegalName = `Gafete ${prefix} Legal ${stamp}`
  businessUnit.businessUnitActive = active
  await businessUnit.save()
  return businessUnit
}

async function deleteBusinessUnit(businessUnit: BusinessUnit | null) {
  if (!businessUnit) return
  await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
}

interface CreateEmployeeOverrides {
  employeeTerminatedDate?: string | null
}

async function createEmployee(
  person: Person,
  businessUnit: BusinessUnit,
  overrides: CreateEmployeeOverrides = {}
): Promise<Employee> {
  const stamp = uniqueStamp()
  const employee = new Employee()
  employee.employeeSyncId = Date.now()
  employee.employeeCode = `BADGE-${stamp}`
  employee.employeeFirstName = person.personFirstname
  employee.employeeLastName = person.personLastname
  employee.employeeSecondLastName = person.personSecondLastname
  employee.employeePayrollNum = `BADGE-${stamp}`
  employee.companyId = 1
  employee.personId = person.personId
  employee.businessUnitId = businessUnit.businessUnitId
  employee.payrollBusinessUnitId = businessUnit.businessUnitId
  employee.employeeTerminatedDate = overrides.employeeTerminatedDate ?? null
  await employee.save()
  return employee
}

async function cleanupEmployee(employeeId: number | null) {
  if (!employeeId) return
  await Employee.query().where('employee_id', employeeId).delete()
}

async function createRepseRegistration(
  businessUnit: BusinessUnit,
  expiresAt: DateTime = DateTime.now().plus({ years: 1 })
): Promise<RepseRegistration> {
  const registration = new RepseRegistration()
  registration.businessUnitId = businessUnit.businessUnitId
  registration.folio = `BADGE-${uniqueStamp()}`
  registration.registeredAt = DateTime.now()
  registration.expiresAt = expiresAt
  registration.status = 'active'
  await registration.save()
  return registration
}

async function cleanupRepseRegistration(id: number | null) {
  if (!id) return
  await RepseRegistration.query().where('repse_registration_id', id).delete()
}

/** Extrae el token de `urlVerificacion` (`.../badge-verification/<token>`). */
function extractToken(urlVerificacion: string): string {
  return urlVerificacion.split('/').pop()!
}

test.group('EmployeeBadge - auth (401 sin autenticación)', () => {
  test('GET /api/employee-badges/:employeeId responde 401', async ({ client }) => {
    const response = await client.get('/api/employee-badges/1')
    response.assertStatus(401)
  })

  test('GET /api/employee-badges/:employeeId/pdf responde 401', async ({ client }) => {
    const response = await client.get('/api/employee-badges/1/pdf')
    response.assertStatus(401)
  })

  test('GET /api/employee-badges/me responde 401', async ({ client }) => {
    const response = await client.get('/api/employee-badges/me')
    response.assertStatus(401)
  })
})

test.group('EmployeeBadge - flujo feliz con folio REPSE vigente (E1/E2)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let employee: Employee | null = null
  let registration: RepseRegistration | null = null
  let firstToken: string | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-happy')
    businessUnit = await createBusinessUnit('happy')
    employee = await createEmployee(root.person, businessUnit)
    registration = await createRepseRegistration(businessUnit)
  })

  group.teardown(async () => {
    await cleanupRepseRegistration(registration?.repseRegistrationId ?? null)
    await cleanupEmployee(employee?.employeeId ?? null)
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('GET /:employeeId devuelve el gafete con folioRepse vigente y genera el token', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/employee-badges/${employee!.employeeId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    const gafete = body.data.gafete

    assert.equal(gafete.empleadoId, employee!.employeeId)
    assert.equal(gafete.nombreCompleto, 'Gafete Test root-happy')
    assert.isNull(gafete.fotoUrl)
    assert.isTrue(gafete.fotoFaltante)
    assert.equal(gafete.empresa, businessUnit!.businessUnitLegalName)
    assert.equal(gafete.folioRepse, registration!.folio)
    assert.isTrue(gafete.folioVigente)
    assert.isTrue(gafete.vinculoVigente)
    assert.include(gafete.urlVerificacion, '/badge-verification/')
    assert.match(gafete.qrDataUrl, /^data:image\/png;base64,/)

    firstToken = extractToken(gafete.urlVerificacion)
    assert.lengthOf(firstToken, 43)
  })

  test('GET /:employeeId nuevamente devuelve el mismo token (persistencia)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/employee-badges/${employee!.employeeId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const token = extractToken(response.body().data.gafete.urlVerificacion)
    assert.equal(token, firstToken)
  })

  test('GET /:employeeId/pdf descarga un PDF válido con headers de adjunto', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/employee-badges/${employee!.employeeId}/pdf`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    assert.equal(response.header('content-type'), 'application/pdf')
    assert.include(response.header('content-disposition') ?? '', 'attachment')
    assert.include(
      response.header('content-disposition') ?? '',
      `gafete-empleado-${employee!.employeeId}.pdf`
    )
    assert.equal(response.header('cache-control'), 'private, no-store')
    assert.isAbove(Number(response.header('content-length')), 0)
  })
})

test.group('EmployeeBadge - nombre compuesto en E1', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let employee: Employee | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'compound-name')
    root!.person.personFirstname = 'Luis Miguel'
    root!.person.personLastname = 'Rodríguez'
    root!.person.personSecondLastname = 'Veltrán'
    await root!.person.save()

    businessUnit = await createBusinessUnit('compound')
    employee = await createEmployee(root!.person, businessUnit)
  })

  group.teardown(async () => {
    await cleanupEmployee(employee?.employeeId ?? null)
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('GET /:employeeId arma nombreCompleto con nombres y apellidos de la persona', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/employee-badges/${employee!.employeeId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    assert.equal(
      response.body().data.gafete.nombreCompleto,
      'Luis Miguel Rodríguez Veltrán'
    )
  })
})

test.group('EmployeeBadge - flujo feliz sin registro REPSE (R7 — universal)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let employee: Employee | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-sinfolio')
    businessUnit = await createBusinessUnit('sinfolio')
    employee = await createEmployee(root.person, businessUnit)
  })

  group.teardown(async () => {
    await cleanupEmployee(employee?.employeeId ?? null)
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('GET /:employeeId devuelve el gafete con folioRepse/folioVigente en null (no es error)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/employee-badges/${employee!.employeeId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const gafete = response.body().data.gafete
    assert.isNull(gafete.folioRepse)
    assert.isNull(gafete.folioVigente)
    assert.isTrue(gafete.vinculoVigente)
  })
})

test.group('EmployeeBadge - folio REPSE vencido', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let employee: Employee | null = null
  let registration: RepseRegistration | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-vencido')
    businessUnit = await createBusinessUnit('vencido')
    employee = await createEmployee(root.person, businessUnit)
    registration = await createRepseRegistration(businessUnit, DateTime.now().minus({ days: 5 }))
  })

  group.teardown(async () => {
    await cleanupRepseRegistration(registration?.repseRegistrationId ?? null)
    await cleanupEmployee(employee?.employeeId ?? null)
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('GET /:employeeId devuelve folioRepse con folioVigente en false', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/employee-badges/${employee!.employeeId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const gafete = response.body().data.gafete
    assert.equal(gafete.folioRepse, registration!.folio)
    assert.isFalse(gafete.folioVigente)
    assert.isTrue(gafete.vinculoVigente)
  })
})

test.group('EmployeeBadge - 404 uniforme (BDG.NF.001)', (group) => {
  let root: TestActor | null = null
  let businessUnitA: BusinessUnit | null = null
  let businessUnitB: BusinessUnit | null = null
  let employeeA: Employee | null = null
  let deletedEmployee: Employee | null = null
  let terminatedEmployee: Employee | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-404')
    businessUnitA = await createBusinessUnit('404-a')
    businessUnitB = await createBusinessUnit('404-b')
    employeeA = await createEmployee(root.person, businessUnitA)

    deletedEmployee = await createEmployee(root.person, businessUnitA)
    await deletedEmployee.delete() // soft delete (SoftDeletes mixin)

    terminatedEmployee = await createEmployee(root.person, businessUnitA, {
      employeeTerminatedDate: DateTime.now().minus({ days: 1 }).toISODate(),
    })
  })

  group.teardown(async () => {
    await cleanupEmployee(employeeA?.employeeId ?? null)
    await cleanupEmployee(deletedEmployee?.employeeId ?? null)
    await cleanupEmployee(terminatedEmployee?.employeeId ?? null)
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnitA)
    await deleteBusinessUnit(businessUnitB)
  })

  test('GET /:employeeId inexistente responde 404 con key gafete-no-encontrado', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employee-badges/999999999')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'gafete-no-encontrado')
    assert.equal(response.body().errorCode, 'BDG.NF.001')
  })

  test('GET /:employeeId de otro tenant responde 404 (aislamiento)', async ({ client, assert }) => {
    const response = await client
      .get(`/api/employee-badges/${employeeA!.employeeId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitB!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'gafete-no-encontrado')
  })

  test('GET /:employeeId de un empleado eliminado (soft delete) responde 404', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/employee-badges/${deletedEmployee!.employeeId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'gafete-no-encontrado')
  })

  test('GET /:employeeId de un empleado dado de baja responde 404', async ({ client, assert }) => {
    const response = await client
      .get(`/api/employee-badges/${terminatedEmployee!.employeeId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'gafete-no-encontrado')
  })

  test('GET /:employeeId/pdf inexistente también responde 404', async ({ client, assert }) => {
    const response = await client
      .get('/api/employee-badges/999999999/pdf')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'gafete-no-encontrado')
  })
})

test.group('EmployeeBadge - validación de entrada (422 BDG.VAL.001)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-val')
    businessUnit = await createBusinessUnit('val')
  })

  group.teardown(async () => {
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('GET /:employeeId no numérico responde 422 con key entrada-invalida', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employee-badges/abc')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(422)
    assert.equal(response.body().key, 'entrada-invalida')
    assert.equal(response.body().errorCode, 'BDG.VAL.001')
  })

  test('GET /:employeeId con 0 responde 422', async ({ client, assert }) => {
    const response = await client
      .get('/api/employee-badges/0')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(422)
    assert.equal(response.body().errorCode, 'BDG.VAL.001')
  })
})

test.group('EmployeeBadge - propio (/me, E3)', (group) => {
  let ownerActor: TestActor | null = null
  let noEmployeeActor: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let ownEmployee: Employee | null = null

  group.setup(async () => {
    ownerActor = await createTestActor(ROOT_ROLE_ID, 'root-me')
    noEmployeeActor = await createTestActor(ROOT_ROLE_ID, 'root-me-sin-empleado')
    businessUnit = await createBusinessUnit('me')
    ownEmployee = await createEmployee(ownerActor.person, businessUnit)
  })

  group.teardown(async () => {
    await cleanupEmployee(ownEmployee?.employeeId ?? null)
    await cleanupTestActor(ownerActor)
    await cleanupTestActor(noEmployeeActor)
    await deleteBusinessUnit(businessUnit)
  })

  test('GET /me devuelve el gafete propio (resuelto por personId)', async ({ client, assert }) => {
    const response = await client
      .get('/api/employee-badges/me')
      .loginAs(ownerActor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    assert.equal(response.body().data.gafete.empleadoId, ownEmployee!.employeeId)
  })

  test('GET /me sin empleado asociado responde 422 con key sin-empleado-asociado', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employee-badges/me')
      .loginAs(noEmployeeActor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(422)
    assert.equal(response.body().key, 'sin-empleado-asociado')
    assert.equal(response.body().errorCode, 'BDG.NF.EMP.001')
  })
})

test.group('EmployeeBadge - i18n (Accept-Language)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-i18n')
    businessUnit = await createBusinessUnit('i18n')
  })

  group.teardown(async () => {
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('404 en español (default)', async ({ client, assert }) => {
    const response = await client
      .get('/api/employee-badges/999999999')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .header('Accept-Language', 'es')

    response.assertStatus(404)
    assert.include(response.body().message, 'no pertenece al tenant actual')
  })

  test('404 en inglés (Accept-Language: en)', async ({ client, assert }) => {
    const response = await client
      .get('/api/employee-badges/999999999')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .header('Accept-Language', 'en')

    response.assertStatus(404)
    assert.include(response.body().message, 'does not belong to the current tenant')
  })

  test('GET /:employeeId mantiene data.gafete con Accept-Language: en', async ({
    client,
    assert,
  }) => {
    const employee = await createEmployee(root!.person, businessUnit!)
    try {
      const response = await client
        .get(`/api/employee-badges/${employee.employeeId}`)
        .loginAs(root!.user)
        .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
        .header('Accept-Language', 'en')

      response.assertStatus(200)
      assert.equal(response.body().title, 'Employee badge')
      assert.isDefined(response.body().data.gafete)
    } finally {
      await cleanupEmployee(employee.employeeId)
    }
  })
})

test.group('EmployeeBadge - verificación pública (E4)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let employee: Employee | null = null
  let registration: RepseRegistration | null = null
  let token: string | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-verify')
    businessUnit = await createBusinessUnit('verify')
    employee = await createEmployee(root.person, businessUnit)
    registration = await createRepseRegistration(businessUnit)

    // Genera el token vía la ruta autenticada (E1) — no toca el rate-limit de E4.
    const setupClient = new ApiClient()
    const showResponse = await setupClient
      .get(`/api/employee-badges/${employee.employeeId}`)
      .loginAs(root.user)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    token = extractToken(showResponse.body().data.gafete.urlVerificacion)
  })

  group.teardown(async () => {
    await cleanupRepseRegistration(registration?.repseRegistrationId ?? null)
    await cleanupEmployee(employee?.employeeId ?? null)
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('secuencia completa: payload, formato inválido, inexistente, vínculo no vigente y 429', async ({
    client,
    assert,
  }) => {
    // 1) Token válido, vínculo vigente, con folio REPSE.
    const valid = await client.get(`/api/public/employee-badge/verify/${token}`)
    valid.assertStatus(200)
    assert.equal(valid.header('cache-control'), 'no-store')
    const verificacion = valid.body().data.verificacion
    assert.equal(verificacion.trabajador, 'Gafete Test root-verify')
    assert.equal(verificacion.empresa, businessUnit!.businessUnitLegalName)
    assert.isTrue(verificacion.vinculoVigente)
    assert.equal(verificacion.folioRepse, registration!.folio)
    assert.isTrue(verificacion.folioVigente)
    assert.deepEqual(Object.keys(verificacion).sort(), [
      'empresa',
      'folioRepse',
      'folioVigente',
      'trabajador',
      'vinculoVigente',
    ])

    // 2) Formato inválido (longitud incorrecta) → mismo 404 que inexistente.
    const malformed = await client.get('/api/public/employee-badge/verify/token-corto')
    malformed.assertStatus(404)
    assert.equal(malformed.body().key, 'verificacion-no-encontrada')
    assert.equal(malformed.body().errorCode, 'BDG.NF.002')

    // 3) Formato válido (43 chars) pero inexistente → mismo 404.
    const nonexistent = await client.get(`/api/public/employee-badge/verify/${'x'.repeat(43)}`)
    nonexistent.assertStatus(404)
    assert.equal(nonexistent.body().key, 'verificacion-no-encontrada')

    // 4) Trabajador dado de baja → 200 con vinculoVigente false (nunca 404, regla 11).
    await Employee.query()
      .where('employee_id', employee!.employeeId)
      .update({ employee_terminated_date: DateTime.now().minus({ days: 1 }).toSQLDate() })

    const terminated = await client.get(`/api/public/employee-badge/verify/${token}`)
    terminated.assertStatus(200)
    assert.isFalse(terminated.body().data.verificacion.vinculoVigente)

    await Employee.query()
      .where('employee_id', employee!.employeeId)
      .update({ employee_terminated_date: null })

    // 5-10) Consumir el resto del budget (10 solicitudes/minuto/IP) con llamadas válidas.
    // Contador acumulado hasta aquí: 4 (valid, malformed, nonexistent, terminated).
    for (let i = 0; i < 6; i += 1) {
      const response = await client.get(`/api/public/employee-badge/verify/${token}`)
      response.assertStatus(200)
    }

    // 11ª solicitud acumulada → excede el límite de 10/min/IP → 429.
    const limited = await client.get(`/api/public/employee-badge/verify/${token}`)
    limited.assertStatus(429)
  })
})
