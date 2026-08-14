import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import BillingSubscription from '#models/billing_subscription'
import BillingInternalNotificationService from '#services/billing_internal_notification_service'
import SelfServiceSubscriptionCreatedMail from '#mails/self_service_subscription_created_mail'

/**
 * Tests funcionales — BillingInternalNotificationService (USRH1785441817250).
 *
 * Cubre los escenarios de §12 con `mail.fake()` para no golpear SMTP real.
 * El servicio nunca lanza: los casos de error usan `assert.doesNotReject`.
 */

const TEST_SMTP_SENDER = 'smtp-billing-notif@gsti.local'
const INTERNAL_RECIPIENT_A = 'billing-notif-a@gsti-tests.local'
const INTERNAL_RECIPIENT_B = 'billing-notif-b@gsti-tests.local'

function makeSubscription(overrides: Partial<BillingSubscription> = {}): BillingSubscription {
  const subscription = new BillingSubscription()
  subscription.billingSubscriptionId = 501
  subscription.billingSubscriptionContractedEmployees = 40
  subscription.billingSubscriptionContractedUnitAmount = 65
  subscription.billingSubscriptionDiscountPercent = 5
  subscription.billingSubscriptionContractedTrialDays = 7
  subscription.billingSubscriptionContractedCurrency = 'MXN'
  subscription.billingSubscriptionContractedTaxRate = 0.16
  subscription.billingSubscriptionContractedSubtotal = 2470
  subscription.billingSubscriptionContractedTaxAmount = 395.2
  subscription.billingSubscriptionContractedTotal = 2865.2
  subscription.billingSubscriptionSubscribedAt = DateTime.fromISO('2026-08-04T12:00:00')
  subscription.billingSubscriptionTrialEndsAt = DateTime.fromISO('2026-08-11T12:00:00')
  Object.assign(subscription, overrides)
  return subscription
}

async function withEnvVars(
  vars: Record<string, string | undefined>,
  executor: () => Promise<void>
): Promise<void> {
  const originals: Record<string, string | undefined> = {}

  for (const [key, value] of Object.entries(vars)) {
    originals[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    await executor()
  } finally {
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
  await withEnvVars({ SMTP_USERNAME: TEST_SMTP_SENDER }, executor)
}

test.group('BillingInternalNotificationService - resolveRecipients', () => {
  test('aplica split, trim y deduplicación por minúsculas', async ({ assert }) => {
    await withEnvVars(
      {
        BILLING_INTERNAL_NOTIFICATION_EMAILS: ` ${INTERNAL_RECIPIENT_A} , ${INTERNAL_RECIPIENT_B} , ${INTERNAL_RECIPIENT_A.toUpperCase()} ,  `,
      },
      async () => {
        const service = new BillingInternalNotificationService()
        const recipients = service.resolveRecipients()

        assert.deepEqual(recipients, [INTERNAL_RECIPIENT_A, INTERNAL_RECIPIENT_B])
      }
    )
  })

  test('usa el fallback cuando la variable no está definida', async ({ assert }) => {
    await withEnvVars({ BILLING_INTERNAL_NOTIFICATION_EMAILS: undefined }, async () => {
      const service = new BillingInternalNotificationService()
      const recipients = service.resolveRecipients()

      assert.deepEqual(recipients, ['desarrollo-software@gruposti.com'])
    })
  })
})

test.group('BillingInternalNotificationService - notifySelfServiceSubscriptionCreated', () => {
  test('CA-1: envía un correo interno a todos los destinatarios configurados', async ({
    assert,
  }) => {
    const fake = mail.fake()
    try {
      await withSmtpConfigured(async () => {
        await withEnvVars(
          {
            BILLING_INTERNAL_NOTIFICATION_EMAILS: `${INTERNAL_RECIPIENT_A},${INTERNAL_RECIPIENT_B}`,
          },
          async () => {
            const service = new BillingInternalNotificationService()
            await service.notifySelfServiceSubscriptionCreated({
              subscription: makeSubscription(),
              businessUnitName: 'Acme Self Service SA',
              billingPlanName: 'Plan Profesional',
            })
          }
        )
      })

      fake.mails.assertSentCount(SelfServiceSubscriptionCreatedMail, 1)
      fake.mails.assertSent(SelfServiceSubscriptionCreatedMail, ({ message }) => {
        const json = message.toJSON() as { message: { subject: string } }
        assert.match(json.message.subject, /Contratación self-service/i)
        assert.include(json.message.subject, 'Acme Self Service SA')
        assert.include(json.message.subject, 'Plan Profesional')
        assert.include(json.message.subject, '40 empleados')
        message.assertHtmlIncludes('Acme Self Service SA')
        message.assertHtmlIncludes('Plan Profesional')
        message.assertHtmlIncludes('Contratación')
        message.assertHtmlIncludes('Importes y cobro')
        return message.hasTo(INTERNAL_RECIPIENT_A) && message.hasTo(INTERNAL_RECIPIENT_B)
      })
    } finally {
      mail.restore()
    }
  })

  test('CA-2: el HTML refleja el snapshot congelado sin recalcular montos', async () => {
    const fake = mail.fake()
    try {
      await withSmtpConfigured(async () => {
        await withEnvVars(
          { BILLING_INTERNAL_NOTIFICATION_EMAILS: INTERNAL_RECIPIENT_A },
          async () => {
            const service = new BillingInternalNotificationService()
            await service.notifySelfServiceSubscriptionCreated({
              subscription: makeSubscription(),
              businessUnitName: 'Snapshot Corp',
              billingPlanName: 'Plan Enterprise',
            })
          }
        )
      })

      fake.mails.assertSent(SelfServiceSubscriptionCreatedMail, ({ message }) => {
        message.assertHtmlIncludes('40')
        message.assertHtmlIncludes('5%')
        message.assertHtmlIncludes('$2,470.00')
        message.assertHtmlIncludes('$395.20')
        message.assertHtmlIncludes('$2,865.20')
        message.assertHtmlIncludes('04/08/2026')
        message.assertHtmlIncludes('11/08/2026')
        message.assertHtmlIncludes('7')
        message.assertHtmlIncludes('MXN')
        return true
      })
    } finally {
      mail.restore()
    }
  })

  test('CA-2: muestra "Sin descuento" cuando el snapshot trae 0%', async () => {
    const fake = mail.fake()
    try {
      await withSmtpConfigured(async () => {
        await withEnvVars(
          { BILLING_INTERNAL_NOTIFICATION_EMAILS: INTERNAL_RECIPIENT_A },
          async () => {
            const service = new BillingInternalNotificationService()
            await service.notifySelfServiceSubscriptionCreated({
              subscription: makeSubscription({ billingSubscriptionDiscountPercent: 0 }),
              businessUnitName: 'Sin Descuento SA',
              billingPlanName: 'Plan Base',
            })
          }
        )
      })

      fake.mails.assertSent(SelfServiceSubscriptionCreatedMail, ({ message }) => {
        message.assertHtmlIncludes('Sin descuento')
        return true
      })
    } finally {
      mail.restore()
    }
  })

  test('CA-3: un fallo SMTP no lanza al caller', async ({ assert }) => {
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
              await service.notifySelfServiceSubscriptionCreated({
                subscription: makeSubscription(),
                businessUnitName: 'Resiliente SA',
                billingPlanName: 'Plan Resiliente',
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

  test('CA-4: lista de destinatarios vacía omite el envío sin lanzar', async ({ assert }) => {
    const fake = mail.fake()
    try {
      await withSmtpConfigured(async () => {
        await withEnvVars({ BILLING_INTERNAL_NOTIFICATION_EMAILS: ' , , ' }, async () => {
          const service = new BillingInternalNotificationService()
          await assert.doesNotReject(async () => {
            await service.notifySelfServiceSubscriptionCreated({
              subscription: makeSubscription(),
              businessUnitName: 'Sin Destinatarios SA',
              billingPlanName: 'Plan Vacío',
            })
          })
        })
      })

      fake.mails.assertNoneSent()
    } finally {
      mail.restore()
    }
  })

  test('sin SMTP_USERNAME omite el envío sin lanzar', async ({ assert }) => {
    const fake = mail.fake()
    const envGet = env.get.bind(env) as (key: string, defaultValue?: string) => unknown
    ;(env as unknown as { get: typeof envGet }).get = (key: string, defaultValue?: string) => {
      if (key === 'SMTP_USERNAME') {
        return ''
      }
      return envGet(key, defaultValue)
    }

    try {
      await withEnvVars(
        { BILLING_INTERNAL_NOTIFICATION_EMAILS: INTERNAL_RECIPIENT_A },
        async () => {
          const service = new BillingInternalNotificationService()
          await assert.doesNotReject(async () => {
            await service.notifySelfServiceSubscriptionCreated({
              subscription: makeSubscription(),
              businessUnitName: 'Sin SMTP SA',
              billingPlanName: 'Plan SMTP',
            })
          })
        }
      )

      fake.mails.assertNoneSent()
    } finally {
      ;(env as unknown as { get: typeof envGet }).get = envGet
      mail.restore()
    }
  })

  test('CA-8: el asunto declara el ambiente cuando NODE_ENV es test', async ({ assert }) => {
    const fake = mail.fake()
    try {
      await withSmtpConfigured(async () => {
        await withEnvVars(
          { BILLING_INTERNAL_NOTIFICATION_EMAILS: INTERNAL_RECIPIENT_A },
          async () => {
            const service = new BillingInternalNotificationService()
            await service.notifySelfServiceSubscriptionCreated({
              subscription: makeSubscription(),
              businessUnitName: 'Ambiente Test SA',
              billingPlanName: 'Plan Test',
            })
          }
        )
      })

      fake.mails.assertSent(SelfServiceSubscriptionCreatedMail, ({ message }) => {
        const json = message.toJSON() as { message: { subject: string } }
        assert.match(json.message.subject, /^\[TEST\] /)
        assert.include(json.message.subject, '[Contratación self-service]')
        return true
      })
    } finally {
      mail.restore()
    }
  })
})
