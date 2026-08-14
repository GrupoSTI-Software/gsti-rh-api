import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import RoleSeeder from '#database/seeders/0006_role_seeder'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingSubscriptionChange from '#models/billing_subscription_change'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import BillingInternalNotificationService from '#services/billing_internal_notification_service'
import SubscriptionChangeRequestedMail from '#mails/subscription_change_requested_mail'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '#constants/billing_subscription_error_codes'
import { toBusinessDateString } from '#utils/business_date'

/**
 * Tests funcionales — aviso interno de solicitud de cambio de suscripción
 * (USRH1786107870862). CA-1…CA-10 con `mail.fake()`.
 */

const TEST_SMTP_SENDER = 'smtp-change-notif@gsti.local'
const INTERNAL_RECIPIENT_A = 'billing-change-notif-a@gsti-tests.local'
const INTERNAL_RECIPIENT_B = 'billing-change-notif-b@gsti-tests.local'
const DEV_WHITELIST_RECIPIENT = 'jsoto@siler-mx.com'
const TEST_PASSWORD = 'BillingChangeNotifTest123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

function makeChangeModel(overrides: Partial<BillingSubscriptionChange> = {}): BillingSubscriptionChange {
  const change = new BillingSubscriptionChange()
  change.billingSubscriptionChangeId = 701
  change.billingSubscriptionId = 501
  change.businessUnitId = 10
  change.billingSubscriptionChangeType = 'increase'
  change.billingSubscriptionChangeStatus = 'pending_payment'
  change.billingSubscriptionChangePreviousEmployees = 100
  change.billingSubscriptionChangeNewEmployees = 150
  change.billingSubscriptionChangeUnitAmount = 65
  change.billingSubscriptionChangeDiscountPercent = 5
  change.billingSubscriptionChangeTaxRate = 0.16
  change.billingSubscriptionChangeSubtotal = 9750
  change.billingSubscriptionChangeTaxAmount = 1560
  change.billingSubscriptionChangeTotal = 11310
  change.billingSubscriptionChangeProratedAmountCents = 91210
  change.billingSubscriptionChangeEffectiveAt = null
  change.billingSubscriptionChangeAppliedAt = null
  change.billingSubscriptionChangeCreatedAt = DateTime.fromISO('2026-08-11T18:30:00.000Z')
  Object.assign(change, overrides)
  return change
}

async function withEnvVars(
  vars: Record<string, string | undefined>,
  executor: () => Promise<void>
): Promise<void> {
  const originals: Record<string, string | undefined> = {}
  const previousGet = env.get.bind(env) as (key: string, defaultValue?: unknown) => unknown

  for (const [key, value] of Object.entries(vars)) {
    originals[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  ;(env as unknown as { get: typeof previousGet }).get = (
    key: string,
    defaultValue?: unknown
  ) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      const value = vars[key]
      if (value === undefined) {
        return defaultValue
      }
      return value
    }
    return previousGet(key, defaultValue)
  }

  try {
    await executor()
  } finally {
    ;(env as unknown as { get: typeof previousGet }).get = previousGet
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

async function withSmtpConfigured(executor: () => Promise<void>): Promise<void> {
  await withEnvVars({ SMTP_USERNAME: TEST_SMTP_SENDER, NODE_ENV: 'production' }, executor)
}

function messageHtml(message: { toJSON(): unknown }): string {
  const json = message.toJSON() as { message: { html?: string } }
  return json.message.html ?? ''
}

async function waitForAsyncNotifications(ms = 150): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureOwnerRole(): Promise<Role> {
  await new RoleSeeder({} as never).run()
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'owner').first()
  if (!role) {
    throw new Error('Se requiere el rol owner en BD.')
  }
  return role
}

async function createTenantActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await ensureOwnerRole()

  const person = new Person()
  person.personFirstname = 'ChangeNotif'
  person.personLastname = 'Owner'
  person.personSecondLastname = emailPrefix
  person.personEmail = email
  await person.save()

  const user = new User()
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Change Notif ${stamp}`
  businessUnit.businessUnitSlug = `change-notif-${stamp}`
  businessUnit.businessUnitLegalName = `Change Notif Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'self_service'
  await businessUnit.save()

  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  return { user, person, businessUnit }
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Change Notif Plan ${stamp}`,
    billingPlanDescription: 'Fixture aviso cambio suscripción',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 65,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: 7,
    billingPlanPriceEffectiveFrom: '2025-01-01',
    billingPlanPriceStripePriceId: null,
    billingPlanPriceProvider: 'manual',
  })

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: 0,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createLiveSubscription(
  businessUnit: BusinessUnit,
  planId: number,
  contractedEmployees: number,
  options: { skipTrial?: boolean; trialing?: boolean } = {}
): Promise<BillingSubscription> {
  const subscriptionService = new BillingSubscriptionService()
  const subscription = await subscriptionService.createSubscription({
    businessUnitPublicId: businessUnit.businessUnitPublicId,
    billingPlanId: planId,
    contractedEmployees,
    skipTrial: options.skipTrial ?? true,
  })

  if (options.trialing) {
    subscription.billingSubscriptionStatus = 'trialing'
    await subscription.save()
    return subscription
  }

  const today = toBusinessDateString()
  subscription.billingSubscriptionCurrentPeriodStart = DateTime.fromISO(today).minus({ days: 10 })
  subscription.billingSubscriptionCurrentPeriodEnd = DateTime.fromISO(today).plus({ days: 20 })
  await subscription.save()
  return subscription
}

async function cleanupPlan(planId: number | null) {
  if (!planId) return
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) {
    await plan.delete()
  }
}

async function cleanupTenantActor(actor: TenantActor | null, planId: number | null = null) {
  if (!actor) return
  await BillingSubscriptionChange.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
  await BillingSubscription.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
  await cleanupPlan(planId)
}

test.group('BillingInternalNotificationService - notifySubscriptionChangeRequested', () => {
  test('CA-1: ampliación con monto a cobrar', async ({ assert }) => {
    const fake = mail.fake()
    try {
      await withSmtpConfigured(async () => {
        await withEnvVars(
          {
            BILLING_INTERNAL_NOTIFICATION_EMAILS: `${INTERNAL_RECIPIENT_A},${INTERNAL_RECIPIENT_B}`,
          },
          async () => {
            const service = new BillingInternalNotificationService()
            await service.notifySubscriptionChangeRequested({
              change: makeChangeModel(),
              businessUnitName: 'Acme Growth SA',
              requestedByName: 'Ana Dueña',
              requestedByEmail: 'ana@acme-tests.local',
              event: 'increase_requested',
              replacedChangeId: null,
              appliedImmediately: false,
            })
          }
        )
      })

      fake.mails.assertSentCount(SubscriptionChangeRequestedMail, 1)
      fake.mails.assertSent(SubscriptionChangeRequestedMail, ({ message }) => {
        const json = message.toJSON() as { message: { subject: string } }
        assert.match(json.message.subject, /Ampliación de suscripción/i)
        assert.include(json.message.subject, 'Acme Growth SA')
        message.assertHtmlIncludes('Acme Growth SA')
        message.assertHtmlIncludes('Ana Dueña')
        message.assertHtmlIncludes('ana@acme-tests.local')
        message.assertHtmlIncludes('100')
        message.assertHtmlIncludes('150')
        message.assertHtmlIncludes('$912.10')
        message.assertHtmlIncludes('#701')
        assert.notInclude(messageHtml(message), 'inicio del periodo siguiente')
        return message.hasTo(INTERNAL_RECIPIENT_A) && message.hasTo(INTERNAL_RECIPIENT_B)
      })
    } finally {
      mail.restore()
    }
  })

  test('CA-2: fallo SMTP no lanza al caller', async ({ assert }) => {
    mail.fake()
    const originalSend = mail.send.bind(mail)
    ;(mail as unknown as { send: typeof mail.send }).send = async () => {
      throw new Error('SMTP caído (simulado)')
    }

    try {
      await withSmtpConfigured(async () => {
        await withEnvVars(
          { BILLING_INTERNAL_NOTIFICATION_EMAILS: INTERNAL_RECIPIENT_A },
          async () => {
            const service = new BillingInternalNotificationService()
            await assert.doesNotReject(async () => {
              await service.notifySubscriptionChangeRequested({
                change: makeChangeModel(),
                businessUnitName: 'Resiliente SA',
                requestedByName: 'Dueño',
                requestedByEmail: 'dueno@resiliente.local',
                event: 'increase_requested',
                replacedChangeId: null,
                appliedImmediately: false,
              })
            })
          }
        )
      })
    } finally {
      ;(mail as unknown as { send: typeof mail.send }).send = originalSend
      mail.restore()
    }
  })

  test('CA-3: gate de desarrollo filtra fuera de la lista blanca', async ({ assert }) => {
    const fake = mail.fake()
    try {
      await withEnvVars(
        {
          NODE_ENV: 'test',
          SMTP_USERNAME: TEST_SMTP_SENDER,
          BILLING_INTERNAL_NOTIFICATION_EMAILS: `${INTERNAL_RECIPIENT_A},${DEV_WHITELIST_RECIPIENT}`,
        },
        async () => {
          const service = new BillingInternalNotificationService()
          await service.notifySubscriptionChangeRequested({
            change: makeChangeModel({ billingSubscriptionChangeId: 702 }),
            businessUnitName: 'Gate Dev SA',
            requestedByName: 'Dueño',
            requestedByEmail: 'dueno@gate.local',
            event: 'decrease_scheduled',
            replacedChangeId: null,
            appliedImmediately: false,
          })
        }
      )

      fake.mails.assertSentCount(SubscriptionChangeRequestedMail, 1)
      fake.mails.assertSent(SubscriptionChangeRequestedMail, ({ message }) => {
        const json = message.toJSON() as { message: { subject: string } }
        assert.match(json.message.subject, /^\[TEST\] /)
        assert.isFalse(message.hasTo(INTERNAL_RECIPIENT_A))
        assert.isTrue(message.hasTo(DEV_WHITELIST_RECIPIENT))
        return true
      })
    } finally {
      mail.restore()
    }
  })

  test('CA-5: reducción agendada sin monto y con fecha de efecto', async ({ assert }) => {
    const fake = mail.fake()
    try {
      await withSmtpConfigured(async () => {
        await withEnvVars(
          { BILLING_INTERNAL_NOTIFICATION_EMAILS: INTERNAL_RECIPIENT_A },
          async () => {
            const service = new BillingInternalNotificationService()
            await service.notifySubscriptionChangeRequested({
              change: makeChangeModel({
                billingSubscriptionChangeId: 703,
                billingSubscriptionChangeType: 'decrease',
                billingSubscriptionChangeStatus: 'scheduled',
                billingSubscriptionChangePreviousEmployees: 100,
                billingSubscriptionChangeNewEmployees: 80,
                billingSubscriptionChangeProratedAmountCents: 0,
                billingSubscriptionChangeEffectiveAt: DateTime.fromISO('2026-09-01T06:00:00.000Z'),
              }),
              businessUnitName: 'Reduce Corp',
              requestedByName: 'Dueño Reduce',
              requestedByEmail: 'dueno@reduce.local',
              event: 'decrease_scheduled',
              replacedChangeId: null,
              appliedImmediately: false,
            })
          }
        )
      })

      fake.mails.assertSent(SubscriptionChangeRequestedMail, ({ message }) => {
        const json = message.toJSON() as { message: { subject: string } }
        assert.match(json.message.subject, /Reducción agendada/i)
        message.assertHtmlIncludes('100')
        message.assertHtmlIncludes('80')
        message.assertHtmlIncludes('Sin monto a cobrar')
        message.assertHtmlIncludes('01/09/2026')
        return true
      })
    } finally {
      mail.restore()
    }
  })

  test('CA-6: cancelación explícita', async ({ assert }) => {
    const fake = mail.fake()
    try {
      await withSmtpConfigured(async () => {
        await withEnvVars(
          { BILLING_INTERNAL_NOTIFICATION_EMAILS: INTERNAL_RECIPIENT_A },
          async () => {
            const service = new BillingInternalNotificationService()
            await service.notifySubscriptionChangeRequested({
              change: makeChangeModel({
                billingSubscriptionChangeId: 704,
                billingSubscriptionChangeType: 'decrease',
                billingSubscriptionChangeStatus: 'canceled',
                billingSubscriptionChangePreviousEmployees: 100,
                billingSubscriptionChangeNewEmployees: 80,
                billingSubscriptionChangeProratedAmountCents: 0,
              }),
              businessUnitName: 'Cancel Corp',
              requestedByName: 'Dueño Cancel',
              requestedByEmail: 'dueno@cancel.local',
              event: 'change_canceled',
              replacedChangeId: null,
              appliedImmediately: false,
            })
          }
        )
      })

      fake.mails.assertSent(SubscriptionChangeRequestedMail, ({ message }) => {
        const json = message.toJSON() as { message: { subject: string } }
        assert.match(json.message.subject, /Cancelación de solicitud/i)
        message.assertHtmlIncludes('#704')
        message.assertHtmlIncludes('100')
        message.assertHtmlIncludes('80')
        return true
      })
    } finally {
      mail.restore()
    }
  })

  test('CA-7: sustitución automática menciona la solicitud reemplazada', async () => {
    const fake = mail.fake()
    try {
      await withSmtpConfigured(async () => {
        await withEnvVars(
          { BILLING_INTERNAL_NOTIFICATION_EMAILS: INTERNAL_RECIPIENT_A },
          async () => {
            const service = new BillingInternalNotificationService()
            await service.notifySubscriptionChangeRequested({
              change: makeChangeModel({
                billingSubscriptionChangeId: 706,
                billingSubscriptionChangeNewEmployees: 150,
              }),
              businessUnitName: 'Replace Corp',
              requestedByName: 'Dueño Replace',
              requestedByEmail: 'dueno@replace.local',
              event: 'increase_requested',
              replacedChangeId: 705,
              appliedImmediately: false,
            })
          }
        )
      })

      fake.mails.assertSentCount(SubscriptionChangeRequestedMail, 1)
      fake.mails.assertSent(SubscriptionChangeRequestedMail, ({ message }) => {
        message.assertHtmlIncludes('#705')
        message.assertHtmlIncludes('reemplaza')
        return true
      })
    } finally {
      mail.restore()
    }
  })

  test('CA-8: ampliación en periodo de prueba sin monto', async ({ assert }) => {
    const fake = mail.fake()
    try {
      await withSmtpConfigured(async () => {
        await withEnvVars(
          { BILLING_INTERNAL_NOTIFICATION_EMAILS: INTERNAL_RECIPIENT_A },
          async () => {
            const service = new BillingInternalNotificationService()
            await service.notifySubscriptionChangeRequested({
              change: makeChangeModel({
                billingSubscriptionChangeId: 707,
                billingSubscriptionChangeStatus: 'applied',
                billingSubscriptionChangeProratedAmountCents: 0,
              }),
              businessUnitName: 'Trial Corp',
              requestedByName: 'Dueño Trial',
              requestedByEmail: 'dueno@trial.local',
              event: 'increase_requested',
              replacedChangeId: null,
              appliedImmediately: true,
            })
          }
        )
      })

      fake.mails.assertSent(SubscriptionChangeRequestedMail, ({ message }) => {
        message.assertHtmlIncludes('Periodo de prueba')
        message.assertHtmlIncludes('sin adeudo prorrateado')
        assert.notInclude(messageHtml(message), '$912.10')
        return true
      })
    } finally {
      mail.restore()
    }
  })

  test('CA-9: sin destinatarios configurados omite el envío', async ({ assert }) => {
    const fake = mail.fake()
    try {
      await withSmtpConfigured(async () => {
        await withEnvVars({ BILLING_INTERNAL_NOTIFICATION_EMAILS: ' , ' }, async () => {
          const service = new BillingInternalNotificationService()
          await assert.doesNotReject(async () => {
            await service.notifySubscriptionChangeRequested({
              change: makeChangeModel({ billingSubscriptionChangeId: 708 }),
              businessUnitName: 'Sin Dest SA',
              requestedByName: 'Dueño',
              requestedByEmail: 'dueno@sin-dest.local',
              event: 'increase_requested',
              replacedChangeId: null,
              appliedImmediately: false,
            })
          })
        })
      })

      fake.mails.assertNoneSent()
    } finally {
      mail.restore()
    }
  })

  test('CA-10: cada correo contiene datos de una sola empresa', async ({ assert }) => {
    const fake = mail.fake()
    try {
      await withSmtpConfigured(async () => {
        await withEnvVars(
          { BILLING_INTERNAL_NOTIFICATION_EMAILS: INTERNAL_RECIPIENT_A },
          async () => {
            const service = new BillingInternalNotificationService()
            await service.notifySubscriptionChangeRequested({
              change: makeChangeModel({ billingSubscriptionChangeId: 709 }),
              businessUnitName: 'Empresa Aislada SA',
              requestedByName: 'Dueño Aislado',
              requestedByEmail: 'dueno@aislada.local',
              event: 'increase_requested',
              replacedChangeId: null,
              appliedImmediately: false,
            })
          }
        )
      })

      fake.mails.assertSent(SubscriptionChangeRequestedMail, ({ message }) => {
        message.assertHtmlIncludes('Empresa Aislada SA')
        assert.isTrue(message.hasTo(INTERNAL_RECIPIENT_A))
        return true
      })
    } finally {
      mail.restore()
    }
  })
})

test.group('POST billing change endpoints — aviso interno USRH1786107870862', () => {
  test('CA-4: solicitud rechazada no envía correo', async ({ client, assert }) => {
    const fake = mail.fake()
    const actor = await createTenantActor('change-notif-reject')
    let planId: number | null = null

    try {
      planId = await createPublishedPlan(Date.now())
      await createLiveSubscription(actor.businessUnit, planId, 100)

      const response = await client
        .post('/api/billing/subscription/changes/increase')
        .json({ employees: 100 })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(422)
      response.assertBodyContains({
        key: 'cantidad-no-es-aumento',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.CHANGE_NOT_AN_INCREASE,
      })

      fake.mails.assertNoneSent()
      const changeCount = await BillingSubscriptionChange.query()
        .where('business_unit_id', actor.businessUnit.businessUnitId)
        .count('* as total')
      assert.equal(Number(changeCount[0].$extras.total), 0)
    } finally {
      mail.restore()
      await cleanupTenantActor(actor, planId)
    }
  })

  test('endpoint de ampliación exitosa dispara exactamente un aviso', async ({ client }) => {
    const fake = mail.fake()
    const actor = await createTenantActor('change-notif-increase')
    let planId: number | null = null

    try {
      planId = await createPublishedPlan(Date.now())
      await createLiveSubscription(actor.businessUnit, planId, 100)

      await withEnvVars(
        {
          NODE_ENV: 'production',
          SMTP_USERNAME: TEST_SMTP_SENDER,
          BILLING_INTERNAL_NOTIFICATION_EMAILS: INTERNAL_RECIPIENT_A,
        },
        async () => {
          const response = await client
            .post('/api/billing/subscription/changes/increase')
            .json({ employees: 150 })
            .loginAs(actor.user)
            .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

          response.assertStatus(201)
          await waitForAsyncNotifications()
          fake.mails.assertSentCount(SubscriptionChangeRequestedMail, 1)
        }
      )
    } finally {
      mail.restore()
      await cleanupTenantActor(actor, planId)
    }
  })

  test('endpoint de reducción exitosa dispara aviso de reducción agendada', async ({
    client,
    assert,
  }) => {
    const fake = mail.fake()
    const actor = await createTenantActor('change-notif-decrease')
    let planId: number | null = null

    try {
      planId = await createPublishedPlan(Date.now())
      await createLiveSubscription(actor.businessUnit, planId, 100)

      await withEnvVars(
        {
          NODE_ENV: 'production',
          SMTP_USERNAME: TEST_SMTP_SENDER,
          BILLING_INTERNAL_NOTIFICATION_EMAILS: INTERNAL_RECIPIENT_A,
        },
        async () => {
          const response = await client
            .post('/api/billing/subscription/changes/decrease')
            .json({ employees: 80 })
            .loginAs(actor.user)
            .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

          response.assertStatus(201)
          await waitForAsyncNotifications()
          fake.mails.assertSent(SubscriptionChangeRequestedMail, ({ message }) => {
            const json = message.toJSON() as { message: { subject: string } }
            assert.match(json.message.subject, /Reducción agendada/i)
            return true
          })
        }
      )
    } finally {
      mail.restore()
      await cleanupTenantActor(actor, planId)
    }
  })

  test('endpoint de cancelación explícita dispara aviso de cancelación', async ({ client }) => {
    const fake = mail.fake()
    const actor = await createTenantActor('change-notif-cancel')
    let planId: number | null = null

    try {
      planId = await createPublishedPlan(Date.now())
      await createLiveSubscription(actor.businessUnit, planId, 100)

      await withEnvVars(
        {
          NODE_ENV: 'production',
          SMTP_USERNAME: TEST_SMTP_SENDER,
          BILLING_INTERNAL_NOTIFICATION_EMAILS: INTERNAL_RECIPIENT_A,
        },
        async () => {
          await client
            .post('/api/billing/subscription/changes/decrease')
            .json({ employees: 80 })
            .loginAs(actor.user)
            .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

          const response = await client
            .post('/api/billing/subscription/changes/cancel')
            .loginAs(actor.user)
            .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

          response.assertStatus(200)
          await waitForAsyncNotifications()
          fake.mails.assertSentCount(SubscriptionChangeRequestedMail, 2)
          fake.mails.assertSent(SubscriptionChangeRequestedMail, ({ message }) => {
            const json = message.toJSON() as { message: { subject: string } }
            return /Cancelación de solicitud/i.test(json.message.subject)
          })
        }
      )
    } finally {
      mail.restore()
      await cleanupTenantActor(actor, planId)
    }
  })
})
