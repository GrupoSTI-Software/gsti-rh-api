import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import SystemSetting from '#models/system_setting'
import { MAIL_BRAND_LOGO_URL } from '#constants/mail_branding'
import TeleworkPolicy from '#models/telework_policy'
import TeleworkPolicyNotificationLog from '#models/telework_policy_notification_log'
import TeleworkPolicyNotificationService from '#modules/telework-policy/telework_policy_notification.service'
import type { TeleworkWorkerRecipient } from '#services/telework_worker_service'
import { ensureRole } from '#tests/helpers/ensure_role'

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
  const role = await ensureRole('root')
  user.roleId = role.roleId
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
    employee_slug: opaqueEmployeeSlug(),
    employee_sync_id: `EMP-NOTIF-${syncSeed}`,
    employee_code: `EMP-NOTIF-${syncSeed}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    payroll_business_unit_id: businessUnitId,
    person_id: personId,
    employee_created_at: now,
  })

  return TenantContext.runUnscoped(
    () => Employee.findOrFail(Number(employeeId)),
    TENANT_UNSCOPED_REASON.TEST_FIXTURE
  )
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
      const policyId = policy.teleworkPolicyId
      await TenantContext.runUnscoped(
        () =>
          TeleworkPolicyNotificationLog.query().where('telework_policy_id', policyId).delete(),
        TENANT_UNSCOPED_REASON.TEST_FIXTURE
      )
      await TeleworkPolicy.query().where('telework_policy_id', policyId).delete()
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

      const log = await TenantContext.runUnscoped(
        () =>
          TeleworkPolicyNotificationLog.query()
            .where('telework_policy_id', policy!.teleworkPolicyId)
            .where('employee_id', employee!.employeeId)
            .orderBy('telework_policy_notification_log_id', 'desc')
            .firstOrFail(),
        TENANT_UNSCOPED_REASON.TEST_FIXTURE
      )
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

      const log = await TenantContext.runUnscoped(
        () =>
          TeleworkPolicyNotificationLog.query()
            .where('telework_policy_id', policy!.teleworkPolicyId)
            .where('employee_id', employee!.employeeId)
            .orderBy('telework_policy_notification_log_id', 'desc')
            .firstOrFail(),
        TENANT_UNSCOPED_REASON.TEST_FIXTURE
      )
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

      const log = await TenantContext.runUnscoped(
        () =>
          TeleworkPolicyNotificationLog.query()
            .where('telework_policy_id', policy!.teleworkPolicyId)
            .where('employee_id', employee!.employeeId)
            .where('telework_policy_notification_log_type', 'reminder')
            .orderBy('telework_policy_notification_log_id', 'desc')
            .firstOrFail(),
        TENANT_UNSCOPED_REASON.TEST_FIXTURE
      )
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

      const log = await TenantContext.runUnscoped(
        () =>
          TeleworkPolicyNotificationLog.query()
            .where('telework_policy_id', policy!.teleworkPolicyId)
            .where('employee_id', employee!.employeeId)
            .where('telework_policy_notification_log_status', 'failed')
            .orderBy('telework_policy_notification_log_id', 'desc')
            .firstOrFail(),
        TENANT_UNSCOPED_REASON.TEST_FIXTURE
      )
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

  test('T-marca el encabezado es Valanserh y el texto conserva el nombre comercial de la empresa', async ({
    assert,
  }) => {
    const logo = 'https://cdn.empresa-a.test/logo-politica.png'
    const setting = await SystemSetting.create({
      businessUnitId: businessUnit!.businessUnitId,
      systemSettingTradeName: 'Empresa A Comercial',
      systemSettingLogo: logo,
      systemSettingSidebarColor: '#FF0000',
      systemSettingActive: 1,
      systemSettingMonthlyConversionFactor: 30.4,
    })
    const fake = mail.fake()

    try {
      const service = new TeleworkPolicyNotificationService()
      const recipient = makeRecipient({
        employeeId: employee!.employeeId,
        email: 'wilvardo@gmail.com',
      })
      await service.send(policy!, [recipient], 'publication', user!.userId)
      const published = sentHtml(fake)
      assert.include(String(published.subject), 'Política de Teletrabajo v1 — Empresa A Comercial')
      assert.include(published.from, 'Valanserh')
      assert.include(published.html, MAIL_BRAND_LOGO_URL)
      assert.include(published.html, 'Empresa A Comercial ha publicado la versión 1')
      assert.include(published.html, 'enviada por Valanserh')
      assert.notInclude(published.html, logo)

      mail.restore()
      const reminderFake = mail.fake()
      await service.send(policy!, [recipient], 'reminder', user!.userId)
      const reminded = sentHtml(reminderFake)
      assert.include(
        String(reminded.subject),
        'Recordatorio: acusa la Política de Teletrabajo v1 — Empresa A Comercial'
      )
      assert.include(reminded.html, 'Política de Teletrabajo de Empresa A Comercial')
    } finally {
      mail.restore()
      await db.from('system_settings').where('system_setting_id', setting.systemSettingId).delete()
    }
  })

  test('T-sin-setting el nombre sale del alta de la empresa y no de una ficha sin dueño', async ({
    assert,
  }) => {
    const orphan = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_active', 1)
      .whereNull('business_unit_id')
      .first()
    const other = await createTestBusinessUnit()
    const otherPolicy = await createTestPolicy(other.businessUnitId, user!.userId)
    const fake = mail.fake()

    try {
      const service = new TeleworkPolicyNotificationService()
      await service.send(
        otherPolicy,
        [makeRecipient({ employeeId: employee!.employeeId, email: 'wilvardo@gmail.com' })],
        'publication',
        user!.userId
      )
      const sent = sentHtml(fake)
      assert.include(String(sent.subject), `— ${other.businessUnitName}`)
      assert.include(sent.html, `${other.businessUnitName} ha publicado`)
      assert.notInclude(sent.html, 'Valanserh ha publicado')
      assert.notInclude(sent.html, 'Ficha Sin Dueño')
      const orphanName = orphan?.systemSettingTradeName?.trim()
      if (orphanName && orphanName !== 'Valanserh' && !other.businessUnitName.includes(orphanName)) {
        assert.notInclude(sent.html, orphanName)
      }
    } finally {
      mail.restore()
      await TenantContext.runUnscoped(
        () =>
          TeleworkPolicyNotificationLog.query()
            .where('telework_policy_id', otherPolicy.teleworkPolicyId)
            .delete(),
        TENANT_UNSCOPED_REASON.TEST_FIXTURE
      )
      await TeleworkPolicy.query().where('telework_policy_id', otherPolicy.teleworkPolicyId).delete()
      await BusinessUnit.query().where('business_unit_id', other.businessUnitId).delete()
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

function sentHtml(fake: ReturnType<typeof mail.fake>): { html: string; subject: unknown; from: string } {
  const found = fake.messages.sent().find((message) => message.hasTo('wilvardo@gmail.com'))
  const raw = found?.nodeMailerMessage
  return {
    html: String(raw?.html ?? ''),
    subject: raw?.subject,
    from: JSON.stringify(raw?.from ?? ''),
  }
}
