import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import i18nManager from '@adonisjs/i18n/services/main'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import Person from '#models/person'
import User from '#models/user'
import type { UserEmailTypeValue } from '#constants/user_email_type'
import { EmailMirrorConflictError } from '#exceptions/email_mirror_conflict_error'
import { EmailMirrorRefusedError } from '#exceptions/email_mirror_refused_error'
import {
  emailMirrorActorFromContext,
  mirrorEmployeeEmailToUserEmail,
  mirrorPersonEmailToUserEmail,
  mirrorUserEmailToRecord,
  toPublicEmailMirrorOutcome,
  type EmailMirrorActor,
} from '#helpers/person_user_email_mirror'
import {
  respondEmailMirrorConflict,
  respondEmailMirrorRefused,
} from '#helpers/user_access_email_api_error'

async function spanishContext(): Promise<HttpContext> {
  const ctx = await testUtils.createHttpContext()
  ctx.i18n = i18nManager.locale('es')
  return ctx
}

test.group('Espejo correo ↔ credencial — respuestas (USRH1789698261612)', () => {
  test('conflicto en users reutiliza verbatim el cuerpo de la 611', async ({ assert }) => {
    const ctx = await spanishContext()
    const body = respondEmailMirrorConflict(ctx, new EmailMirrorConflictError('users'))
    assert.equal(ctx.response.getStatus(), 400)
    assert.deepEqual(body, {
      title: 'Este correo de acceso ya está en uso',
      detail:
        'Otra cuenta activa usa este correo de acceso; usa uno distinto o da de baja la cuenta que lo tiene. No se guardó ningún cambio.',
      key: 'correo-de-acceso-ya-registrado',
      code: 'USR.MAIL.002',
    })
  })

  test('conflicto en people → USR.MAIL.003', async ({ assert }) => {
    const ctx = await spanishContext()
    const body = respondEmailMirrorConflict(ctx, new EmailMirrorConflictError('people'))
    assert.equal(ctx.response.getStatus(), 400)
    assert.equal(body.key, 'correo-personal-ya-registrado')
    assert.equal(body.code, 'USR.MAIL.003')
    assert.equal(body.title, 'Este correo personal ya está en uso')
  })

  test('conflicto en employees → USR.MAIL.004', async ({ assert }) => {
    const ctx = await spanishContext()
    const body = respondEmailMirrorConflict(ctx, new EmailMirrorConflictError('employees'))
    assert.equal(ctx.response.getStatus(), 400)
    assert.equal(body.key, 'correo-institucional-ya-registrado')
    assert.equal(body.code, 'USR.MAIL.004')
  })

  test('fuera de alcance y actor ausente responden el MISMO cuerpo 403', async ({ assert }) => {
    const ctxA = await spanishContext()
    const ctxB = await spanishContext()
    const outOfScope = respondEmailMirrorRefused(ctxA, new EmailMirrorRefusedError('target-out-of-scope'))
    const missingActor = respondEmailMirrorRefused(ctxB, new EmailMirrorRefusedError('missing-actor'))
    assert.equal(ctxA.response.getStatus(), 403)
    assert.deepEqual(outOfScope, missingActor)
    assert.equal(outOfScope.code, 'USR.MAIL.005')
    assert.equal(outOfScope.key, 'cuenta-de-acceso-fuera-de-alcance')
  })

  test('varios usuarios vivos → 400 USR.MAIL.006 sin decir cuántos', async ({ assert }) => {
    const ctx = await spanishContext()
    const body = respondEmailMirrorRefused(ctx, new EmailMirrorRefusedError('multiple-live-users'))
    assert.equal(ctx.response.getStatus(), 400)
    assert.equal(body.code, 'USR.MAIL.006')
    assert.equal(body.key, 'cuenta-de-acceso-no-determinada')
    assert.notMatch(JSON.stringify(body), /\d+ (cuentas|usuarios)/)
  })

  test('los mensajes del error no llevan datos del conflicto', async ({ assert }) => {
    assert.equal(new EmailMirrorConflictError('people').message, 'Email mirror conflict on people')
    assert.equal(
      new EmailMirrorRefusedError('multiple-live-users').message,
      'Email mirror refused: multiple-live-users'
    )
  })
})

const UNIT_PASSWORD = 'EspejoUnitario123!'
const created = {
  userIds: [] as number[],
  personIds: [] as number[],
  employeeIds: [] as number[],
  businessUnitIds: [] as number[],
}

function uniq(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function newBusinessUnit(): Promise<BusinessUnit> {
  const s = uniq()
  const unit = await BusinessUnit.create({
    businessUnitName: `Espejo unit ${s}`,
    businessUnitSlug: `espejo-unit-${s}`,
    businessUnitLegalName: `Espejo unit legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  created.businessUnitIds.push(unit.businessUnitId)
  return unit
}

async function newPerson(personEmail: string | null): Promise<Person> {
  const person = await Person.create({
    personFirstname: 'Espejo',
    personLastname: 'Unit',
    personSecondLastname: uniq(),
    personEmail,
  })
  created.personIds.push(person.personId)
  return person
}

async function newUser(
  person: Person,
  userEmail: string,
  userEmailType: UserEmailTypeValue,
  businessUnit: BusinessUnit
): Promise<User> {
  const user = await User.create({
    userEmail,
    userPassword: UNIT_PASSWORD,
    userActive: 1,
    roleId: 1,
    personId: person.personId,
    userEmailType,
  })
  created.userIds.push(user.userId)
  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return user
}

async function newEmployee(
  person: Person,
  businessUnit: BusinessUnit,
  businessEmail: string
): Promise<Employee> {
  const s = uniq()
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `EU-${s}`
  employee.employeeFirstName = 'Espejo'
  employee.employeeLastName = 'Unit'
  employee.employeeSecondLastName = s.slice(0, 20)
  employee.employeePayrollNum = `EU-${s}`
  employee.employeeBusinessEmail = businessEmail
  employee.companyId = businessUnit.businessUnitId
  employee.personId = person.personId
  employee.businessUnitId = businessUnit.businessUnitId
  employee.payrollBusinessUnitId = businessUnit.businessUnitId
  employee.employeeTypeId = 1
  employee.departmentId = null
  employee.positionId = null
  await employee.save()
  created.employeeIds.push(employee.employeeId)
  return employee
}

function actorFor(businessUnit: BusinessUnit): EmailMirrorActor {
  return { userId: 1, businessUnitScope: [businessUnit.businessUnitId], i18n: i18nManager.locale('es') }
}

async function inTrx<T>(fn: (trx: TransactionClientContract) => Promise<T>): Promise<T> {
  return db.transaction(fn)
}

async function userEmailOf(userId: number): Promise<string> {
  const row = await db.from('users').where('user_id', userId).select('user_email').first()
  return row.user_email
}

async function personEmailOf(personId: number): Promise<string | null> {
  const person = await Person.findOrFail(personId)
  return person.personEmail
}

async function employeeEmailOf(employeeId: number): Promise<string | null> {
  const row = await db
    .from('employees')
    .where('employee_id', employeeId)
    .select('employee_business_email')
    .first()
  return row.employee_business_email
}

async function cleanupCreated(): Promise<void> {
  if (created.userIds.length > 0) {
    await BusinessUnitUser.query().whereIn('user_id', created.userIds).delete()
    await User.query().whereIn('user_id', created.userIds).delete()
  }
  if (created.employeeIds.length > 0) {
    await Employee.query().withTrashed().whereIn('employee_id', created.employeeIds).delete()
  }
  if (created.personIds.length > 0) {
    await Person.query().withTrashed().whereIn('person_id', created.personIds).delete()
  }
  if (created.businessUnitIds.length > 0) {
    await BusinessUnit.query().whereIn('business_unit_id', created.businessUnitIds).delete()
  }
}

test.group('Espejo — expediente → credencial (M1)', (group) => {
  let unit: BusinessUnit
  group.setup(async () => {
    unit = await newBusinessUnit()
  })
  group.teardown(cleanupCreated)

  test('personal: escribe aunque el correo de acceso no tenga nada que ver con el anterior (regla 1)', async ({
    assert,
  }) => {
    const person = await newPerson(null)
    const user = await newUser(person, `acceso-${uniq()}@x.com`, 'personal', unit)
    const nuevo = `nuevo-${uniq()}@correo.com`
    const outcome = await inTrx((trx) =>
      mirrorPersonEmailToUserEmail({
        personId: person.personId,
        personEmail: nuevo,
        actor: actorFor(unit),
        trx,
      })
    )
    assert.deepEqual(toPublicEmailMirrorOutcome(outcome), { status: 'written', target: 'users' })
    assert.equal(await userEmailOf(user.userId), nuevo)
  })

  test('institutional: email-type-mismatch y la credencial no cambia (reglas 2 y 8)', async ({
    assert,
  }) => {
    const email = `inst-${uniq()}@empresa.com`
    const person = await newPerson(`p-${uniq()}@correo.com`)
    const user = await newUser(person, email, 'institutional', unit)
    const outcome = await inTrx((trx) =>
      mirrorPersonEmailToUserEmail({
        personId: person.personId,
        personEmail: `otro-${uniq()}@correo.com`,
        actor: actorFor(unit),
        trx,
      })
    )
    assert.deepEqual(outcome, { status: 'skipped', reason: 'email-type-mismatch' })
    assert.equal(await userEmailOf(user.userId), email)
  })

  test('sin usuario vivo: no-live-counterpart (incluye usuario dado de baja)', async ({ assert }) => {
    const person = await newPerson(null)
    const user = await newUser(person, `baja-${uniq()}@x.com`, 'personal', unit)
    await user.delete()
    const outcome = await inTrx((trx) =>
      mirrorPersonEmailToUserEmail({
        personId: person.personId,
        personEmail: `n-${uniq()}@x.com`,
        actor: actorFor(unit),
        trx,
      })
    )
    assert.deepEqual(outcome, { status: 'skipped', reason: 'no-live-counterpart' })
  })

  test('origen vacío o solo espacios: source-email-empty', async ({ assert }) => {
    const person = await newPerson(null)
    for (const value of ['', '   ', null, undefined]) {
      const outcome = await inTrx((trx) =>
        mirrorPersonEmailToUserEmail({
          personId: person.personId,
          personEmail: value,
          actor: actorFor(unit),
          trx,
        })
      )
      assert.deepEqual(outcome, { status: 'skipped', reason: 'source-email-empty' })
    }
  })

  test('mismo valor: already-in-sync', async ({ assert }) => {
    const email = `sync-${uniq()}@correo.com`
    const person = await newPerson(email)
    await newUser(person, email, 'personal', unit)
    const outcome = await inTrx((trx) =>
      mirrorPersonEmailToUserEmail({
        personId: person.personId,
        personEmail: `  ${email} `,
        actor: actorFor(unit),
        trx,
      })
    )
    assert.deepEqual(outcome, { status: 'skipped', reason: 'already-in-sync' })
  })

  test('correo ocupado por otra cuenta viva: EmailMirrorConflictError(users) sin escribir (regla 6)', async ({
    assert,
  }) => {
    const ocupado = `ocupado-${uniq()}@correo.com`
    await newUser(await newPerson(null), ocupado, 'personal', unit)
    const email = `mio-${uniq()}@correo.com`
    const person = await newPerson(email)
    const user = await newUser(person, email, 'personal', unit)
    await assert.rejects(
      () =>
        inTrx((trx) =>
          mirrorPersonEmailToUserEmail({
            personId: person.personId,
            personEmail: ocupado,
            actor: actorFor(unit),
            trx,
          })
        ),
      'Email mirror conflict on users'
    )
    assert.equal(await userEmailOf(user.userId), email)
  })

  test('CA-14 dos usuarios vivos: multiple-live-users y ninguno cambia', async ({ assert }) => {
    const person = await newPerson(null)
    const a = await newUser(person, `a-${uniq()}@x.com`, 'personal', unit)
    const b = await newUser(person, `b-${uniq()}@x.com`, 'personal', unit)
    await assert.rejects(
      () =>
        inTrx((trx) =>
          mirrorPersonEmailToUserEmail({
            personId: person.personId,
            personEmail: `n-${uniq()}@x.com`,
            actor: actorFor(unit),
            trx,
          })
        ),
      'Email mirror refused: multiple-live-users'
    )
    assert.equal(await userEmailOf(a.userId), a.userEmail)
    assert.equal(await userEmailOf(b.userId), b.userEmail)
  })

  test('cuenta fuera del alcance del actor: target-out-of-scope y no escribe (B8)', async ({
    assert,
  }) => {
    const foreign = await newBusinessUnit()
    const email = `fuera-${uniq()}@x.com`
    const person = await newPerson(null)
    const user = await newUser(person, email, 'personal', foreign)
    await assert.rejects(
      () =>
        inTrx((trx) =>
          mirrorPersonEmailToUserEmail({
            personId: person.personId,
            personEmail: `atacante-${uniq()}@x.com`,
            actor: actorFor(unit),
            trx,
          })
        ),
      'Email mirror refused: target-out-of-scope'
    )
    assert.equal(await userEmailOf(user.userId), email)
  })
})

test.group('Espejo — empleado → credencial (M6)', (group) => {
  let unit: BusinessUnit
  group.setup(async () => {
    unit = await newBusinessUnit()
  })
  group.teardown(cleanupCreated)

  test('institutional: escribe', async ({ assert }) => {
    const person = await newPerson(null)
    const user = await newUser(person, `viejo-${uniq()}@empresa.com`, 'institutional', unit)
    const nuevo = `nuevo-${uniq()}@empresa.com`
    const outcome = await inTrx((trx) =>
      mirrorEmployeeEmailToUserEmail({
        personId: person.personId,
        employeeBusinessEmail: nuevo,
        actor: actorFor(unit),
        trx,
      })
    )
    assert.equal(outcome.status, 'written')
    assert.equal(await userEmailOf(user.userId), nuevo)
  })

  test('CA-3 personal: email-type-mismatch y la credencial no cambia', async ({ assert }) => {
    const email = `personal-${uniq()}@correo.com`
    const person = await newPerson(email)
    const user = await newUser(person, email, 'personal', unit)
    const outcome = await inTrx((trx) =>
      mirrorEmployeeEmailToUserEmail({
        personId: person.personId,
        employeeBusinessEmail: `x-${uniq()}@empresa.com`,
        actor: actorFor(unit),
        trx,
      })
    )
    assert.deepEqual(outcome, { status: 'skipped', reason: 'email-type-mismatch' })
    assert.equal(await userEmailOf(user.userId), email)
  })

  test('correo ocupado por otra cuenta viva: EmailMirrorConflictError(users)', async ({ assert }) => {
    const ocupado = `ocupado-${uniq()}@empresa.com`
    await newUser(await newPerson(null), ocupado, 'institutional', unit)
    const person = await newPerson(null)
    await newUser(person, `mio-${uniq()}@empresa.com`, 'institutional', unit)
    await assert.rejects(
      () =>
        inTrx((trx) =>
          mirrorEmployeeEmailToUserEmail({
            personId: person.personId,
            employeeBusinessEmail: ocupado,
            actor: actorFor(unit),
            trx,
          })
        ),
      'Email mirror conflict on users'
    )
  })
})

test.group('Espejo — credencial → expediente (M2-M5)', (group) => {
  let unit: BusinessUnit
  group.setup(async () => {
    unit = await newBusinessUnit()
  })
  group.teardown(cleanupCreated)

  test('personal: escribe person_email, devuelve la imagen previa y no toca al empleado (regla 3)', async ({
    assert,
  }) => {
    const anterior = `anterior-${uniq()}@correo.com`
    const person = await newPerson(anterior)
    const empresa = `empresa-${uniq()}@empresa.com`
    const employee = await newEmployee(person, unit, empresa)
    const nuevo = `nuevo-${uniq()}@correo.com`
    const outcome = await inTrx((trx) =>
      mirrorUserEmailToRecord({
        personId: person.personId,
        userEmail: nuevo,
        userEmailType: 'personal',
        actor: actorFor(unit),
        trx,
      })
    )
    assert.equal(outcome.status, 'written')
    if (outcome.status === 'written') {
      assert.equal(outcome.target, 'people')
      assert.equal(outcome.previousValue, anterior)
    }
    assert.equal(await personEmailOf(person.personId), nuevo)
    assert.equal(await employeeEmailOf(employee.employeeId), empresa)
  })

  test('personal sin persona viva: no-live-counterpart', async ({ assert }) => {
    const person = await newPerson(null)
    await person.delete()
    const outcome = await inTrx((trx) =>
      mirrorUserEmailToRecord({
        personId: person.personId,
        userEmail: `x-${uniq()}@x.com`,
        userEmailType: 'personal',
        actor: actorFor(unit),
        trx,
      })
    )
    assert.deepEqual(outcome, { status: 'skipped', reason: 'no-live-counterpart' })
  })

  test('personal con correo de otra persona (global): EmailMirrorConflictError(people)', async ({
    assert,
  }) => {
    const ocupado = `ajeno-${uniq()}@correo.com`
    await newPerson(ocupado)
    const anterior = `mio-${uniq()}@correo.com`
    const person = await newPerson(anterior)
    await assert.rejects(
      () =>
        inTrx((trx) =>
          mirrorUserEmailToRecord({
            personId: person.personId,
            userEmail: ocupado,
            userEmailType: 'personal',
            actor: actorFor(unit),
            trx,
          })
        ),
      'Email mirror conflict on people'
    )
    assert.equal(await personEmailOf(person.personId), anterior)
  })

  test('CA-4 institutional: escribe employee_business_email y person_email queda intacto', async ({
    assert,
  }) => {
    const personal = `personal-${uniq()}@correo.com`
    const person = await newPerson(personal)
    const employee = await newEmployee(person, unit, `viejo-${uniq()}@empresa.com`)
    const nuevo = `nuevo-${uniq()}@empresa.com`
    const outcome = await inTrx((trx) =>
      mirrorUserEmailToRecord({
        personId: person.personId,
        userEmail: nuevo,
        userEmailType: 'institutional',
        actor: actorFor(unit),
        trx,
      })
    )
    assert.deepEqual(toPublicEmailMirrorOutcome(outcome), {
      status: 'written',
      target: 'employees',
    })
    assert.equal(await employeeEmailOf(employee.employeeId), nuevo)
    assert.equal(await personEmailOf(person.personId), personal)
  })

  test('CA-10 institutional sin empleado vivo: no-live-counterpart', async ({ assert }) => {
    const person = await newPerson(null)
    const outcome = await inTrx((trx) =>
      mirrorUserEmailToRecord({
        personId: person.personId,
        userEmail: `x-${uniq()}@empresa.com`,
        userEmailType: 'institutional',
        actor: actorFor(unit),
        trx,
      })
    )
    assert.deepEqual(outcome, { status: 'skipped', reason: 'no-live-counterpart' })
  })

  test('institutional con correo de otro empleado vivo: EmailMirrorConflictError(employees)', async ({
    assert,
  }) => {
    const ocupado = `ocupado-${uniq()}@empresa.com`
    await newEmployee(await newPerson(null), unit, ocupado)
    const person = await newPerson(null)
    const propio = `propio-${uniq()}@empresa.com`
    const employee = await newEmployee(person, unit, propio)
    await assert.rejects(
      () =>
        inTrx((trx) =>
          mirrorUserEmailToRecord({
            personId: person.personId,
            userEmail: ocupado,
            userEmailType: 'institutional',
            actor: actorFor(unit),
            trx,
          })
        ),
      'Email mirror conflict on employees'
    )
    assert.equal(await employeeEmailOf(employee.employeeId), propio)
  })

  test('mismo valor: already-in-sync', async ({ assert }) => {
    const email = `igual-${uniq()}@empresa.com`
    const person = await newPerson(null)
    await newEmployee(person, unit, email)
    const outcome = await inTrx((trx) =>
      mirrorUserEmailToRecord({
        personId: person.personId,
        userEmail: email,
        userEmailType: 'institutional',
        actor: actorFor(unit),
        trx,
      })
    )
    assert.deepEqual(outcome, { status: 'skipped', reason: 'already-in-sync' })
  })
})

test.group('Espejo — actor y proyección pública', () => {
  test('sin usuario autenticado: missing-actor (B6)', async ({ assert }) => {
    const ctx = await spanishContext()
    assert.throws(() => emailMirrorActorFromContext(ctx), 'Email mirror refused: missing-actor')
  })

  test('la proyección pública no lleva targetId ni imagen previa', ({ assert }) => {
    const publicOutcome = toPublicEmailMirrorOutcome({
      status: 'written',
      target: 'people',
      targetId: 99,
      previousValue: 'secreto@correo.com',
    })
    assert.deepEqual(publicOutcome, { status: 'written', target: 'people' })
    assert.notInclude(JSON.stringify(publicOutcome), 'secreto')
  })
})
