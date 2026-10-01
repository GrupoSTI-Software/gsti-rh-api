import logger from '@adonisjs/core/services/logger'
import { buildStripeStartupLog } from '#modules/billing-provider/stripe_billing_provider.config'
import { stripeBillingProvider } from '#modules/billing-provider/billing_provider.registry'

/**
 * Informa una sola vez al arrancar el servidor HTTP el modo de Stripe (USRH1790708507496).
 * No corre en consola/Ace (p. ej. `billing:tick-subscriptions`).
 */
const startupLog = buildStripeStartupLog(stripeBillingProvider.describe())
logger[startupLog.level](startupLog.fields, startupLog.message)
