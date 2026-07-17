import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import TeleworkPolicy from '#models/telework_policy'
import TeleworkPolicyNotificationLog from '#models/telework_policy_notification_log'
import TeleworkPolicyNotificationService from '#modules/telework-policy/telework_policy_notification.service'
import type { TeleworkWorkerRecipient } from '#services/telework_worker_service'

/**
 * Unit — `TeleworkPolicyNotificationService` (USRH1783547655377): envío +
 * bitácora + gate de desarrollo. Usa `mail.fake()` (mismo mecanismo que
 * `auth_mail_service.spec.ts`) para no golpear un SMTP real; los registros
 * de bitácora sí se persisten (FKs `RESTRICT` a policy/employee/business
 * unit), por lo que se crean fixtures reales mínimos.
 */

const TEST_PASSWORD = 'TeleworkPolicyNotifTest123!'

async function createTestUser(): Promise<User> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const person = new Person()
  person.personFirstname = 'Notif'
  person.personLastname = 'Test'
  person.personSecondLastname = stamp
  await person.save()

  const user = new User()
  user.userEmail = `notif-test-${stamp}@gsti-tests.local`
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  user.roleId = 3
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()
  return user
}

async function createTestBusinessUnit(): Promise<BusinessUnit> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `TWP Notif Test ${stamp}`
  businessUnit.businessUnitSlug = `twp-notif-test-${stamp}`
  businessUnit.businessUnitLegalName = `TWP Notif Test Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

async function createTestEmployee(businessUnitId: number): Promise<Employee> {
  const syncSeed = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const now = new Date()

  const [personId] = await db.table('people').insert({
    person_firstname: 'Empleado',
    person_lastname: 'Notif',
    person_second_lastname: syncSeed,
    person_created_at: now,
  })

  const [employeeId] = await db.table('employees').insert({
    employee_sync_id: `EMP-NOTIF-${syncSeed}`,
    employee_code: `EMP-NOTIF-${syncSeed}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    person_id: personId,
    employee_created_at: now,
  })

  return Employee.findOrFail(Number(employeeId))
}

async function createTestPolicy(businessUnitId: number, userId: number): Promise<TeleworkPolicy> {
  const record = new TeleworkPolicy()
  record.businessUnitId = businessUnitId
  record.teleworkPolicyVersion = 1
  record.teleworkPolicyTitle = 'Política de Teletrabajo'
  record.teleworkPolicyComponents = []
  record.teleworkPolicyStatus = 'published'
  record.teleworkPolicyIsCurrent = true
  record.teleworkPolicyContentHash = 'fake-hash'
  record.createdByUserId = userId
  record.updatedByUserId = userId
  record.publishedByUserId = userId
  await record.save()
  return record
}

function makeRecipient(overrides: Partial<TeleworkWorkerRecipient> = {}): TeleworkWorkerRecipient {
  return {
    employeeId: 0,
    employeeCode: 'EMP-0',
    fullName: 'Destinatario Prueba',
    position: 'Analista',
    email: '',
    ...overrides,
  }
}

test.group('TeleworkPolicyNotificationService.send', (group) => {
  let user: User | null = null
  let businessUnit: BusinessUnit | null = null
  let employee: Employee | null = null
  let policy: TeleworkPolicy | null = null

  group.setup(async () => {
    user = await createTestUser()
    businessUnit = await createTestBusinessUnit()
    employee = await createTestEmployee(businessUnit.businessUnitId)
    policy = await createTestPolicy(businessUnit.businessUnitId, user.userId)
  })

  group.teardown(async () => {
    if (policy) {
      await TeleworkPolicyNotificationLog.query()
        .where('telework_policy_id', policy.teleworkPolicyId)
        .delete()
      await TeleworkPolicy.query().where('telework_policy_id', policy.teleworkPolicyId).delete()
    }
    if (employee) {
      await Employee.query().where('employee_id', employee.employeeId).delete()
    }
    if (businessUnit) {
      await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
    }
    if (user) {
      await User.query().where('user_id', user.userId).delete()
      await Person.query().where('person_id', user.personId).delete()
    }
  })

  test('sin correo: registra "skipped" con motivo sin-correo, no llama a mail.send', async ({
    assert,
  }) => {
    const fake = mail.fake()
    try {
      const service = new TeleworkPolicyNotificationService()
      const recipient = makeRecipient({ employeeId: employee!.employeeId, email: '' })

      const summary = await service.send(policy!, [recipient], 'publication', user!.userId)

      assert.equal(summary.total, 1)
      assert.equal(summary.skipped, 1)
      assert.equal(summary.sent, 0)
      assert.equal(summary.failed, 0)
      fake.messages.assertNoneSent()

      const log = await TeleworkPolicyNotificationLog.query()
        .where('telework_policy_id', policy!.teleworkPolicyId)
        .where('employee_id', employee!.employeeId)
        .orderBy('telework_policy_notification_log_id', 'desc')
        .firstOrFail()
      assert.equal(log.teleworkPolicyNotificationLogStatus, 'skipped')
      assert.equal(log.teleworkPolicyNotificationLogError, 'sin-correo')
    } finally {
      mail.restore()
    }
  })

  test('con correo fuera de la lista blanca de desarrollo: simula el envío ("sent"), sin correo real', async ({
    assert,
  }) => {
    const fake = mail.fake()
    try {
      const service = new TeleworkPolicyNotificationService()
      const recipient = makeRecipient({
        employeeId: employee!.employeeId,
        email: 'teletrabajador-fuera-de-lista@example.com',
      })

      const summary = await service.send(policy!, [recipient], 'publication', user!.userId)

      assert.equal(summary.sent, 1)
      assert.equal(summary.failed, 0)
      assert.equal(summary.skipped, 0)
      // Gate dev: nunca debe salir un correo real a quien no está en la lista blanca.
      fake.messages.assertNoneSent()

      const log = await TeleworkPolicyNotificationLog.query()
        .where('telework_policy_id', policy!.teleworkPolicyId)
        .where('employee_id', employee!.employeeId)
        .orderBy('telework_policy_notification_log_id', 'desc')
        .firstOrFail()
      assert.equal(log.teleworkPolicyNotificationLogStatus, 'sent')
    } finally {
      mail.restore()
    }
  })

  test('con correo en la lista blanca de desarrollo: sí envía (interceptado por mail.fake) y registra "sent"', async ({
    assert,
  }) => {
    const fake = mail.fake()
    try {
      const service = new TeleworkPolicyNotificationService()
      const recipient = makeRecipient({
        employeeId: employee!.employeeId,
        email: 'wilvardo@gmail.com',
      })

      const summary = await service.send(policy!, [recipient], 'reminder', user!.userId)

      assert.equal(summary.sent, 1)
      fake.messages.assertSent((message) => message.hasTo('wilvardo@gmail.com'))

      const log = await TeleworkPolicyNotificationLog.query()
        .where('telework_policy_id', policy!.teleworkPolicyId)
        .where('employee_id', employee!.employeeId)
        .where('telework_policy_notification_log_type', 'reminder')
        .orderBy('telework_policy_notification_log_id', 'desc')
        .firstOrFail()
      assert.equal(log.teleworkPolicyNotificationLogStatus, 'sent')
    } finally {
      mail.restore()
    }
  })

  test('un fallo al enviar no lanza al caller: registra "failed" y continúa el lote', async ({
    assert,
  }) => {
    mail.fake()
    const originalSend = mail.send.bind(mail)
    // Fuerza el único punto donde el service puede fallar de verdad (dentro
    // de la lista blanca de desarrollo, donde sí se intenta enviar).
    ;(mail as unknown as { send: typeof mail.send }).send = async () => {
      throw new Error('SMTP caído (simulado)')
    }

    try {
      const service = new TeleworkPolicyNotificationService()
      const recipients = [
        makeRecipient({ employeeId: employee!.employeeId, email: 'wilvardo@gmail.com' }),
      ]

      const summary = await service.send(policy!, recipients, 'publication', user!.userId)

      assert.equal(summary.total, 1)
      assert.equal(summary.failed, 1)
      assert.equal(summary.sent, 0)

      const log = await TeleworkPolicyNotificationLog.query()
        .where('telework_policy_id', policy!.teleworkPolicyId)
        .where('employee_id', employee!.employeeId)
        .where('telework_policy_notification_log_status', 'failed')
        .orderBy('telework_policy_notification_log_id', 'desc')
        .firstOrFail()
      assert.equal(log.teleworkPolicyNotificationLogError, 'SMTP caído (simulado)')
    } finally {
      ;(mail as unknown as { send: typeof mail.send }).send = originalSend
      mail.restore()
    }
  })

  test('lote mixto: un destinatario sin correo y otro exitoso — ninguno bloquea al otro', async ({
    assert,
  }) => {
    mail.fake()
    try {
      const service = new TeleworkPolicyNotificationService()
      const recipients = [
        makeRecipient({ employeeId: employee!.employeeId, email: '' }),
        makeRecipient({ employeeId: employee!.employeeId, email: 'otro-fuera-de-lista@example.com' }),
      ]

      const summary = await service.send(policy!, recipients, 'publication', user!.userId)

      assert.equal(summary.total, 2)
      assert.equal(summary.skipped, 1)
      assert.equal(summary.sent, 1)
      assert.equal(summary.failed, 0)
    } finally {
      mail.restore()
    }
  })

  test('conjunto vacío de destinatarios: no crea bitácora y responde el resumen en ceros', async ({
    assert,
  }) => {
    const fake = mail.fake()
    try {
      const service = new TeleworkPolicyNotificationService()

      const summary = await service.send(policy!, [], 'publication', user!.userId)

      assert.deepEqual(summary, { total: 0, sent: 0, failed: 0, skipped: 0 })
      fake.messages.assertNoneSent()
    } finally {
      mail.restore()
    }
  })
})
