import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import env from '#start/env'
import BillingSubscriptionClockService from '#services/billing_subscription_clock_service'
import { toBusinessDateString } from '../app/utils/business_date.js'

/**
 * Reloj de suscripción (USRH1784574994921): evalúa todas las suscripciones
 * no canceladas y transiciona sus estados según las fechas de prueba y periodo
 * (R0-R7 del spec). El barrido es idempotente: correrlo dos veces el mismo
 * día produce el mismo resultado.
 *
 * Disparo normal: scheduler (ver `start/scheduler.ts`), una vez al día a las
 * 07:00 CDMX (13:00 UTC).
 * Disparo manual (depuración / reproceso): `node ace billing:tick-subscriptions
 *   [--date=YYYY-MM-DD] [--force]`.
 *
 * Guard de entorno: fuera de producción no corre solo; usa --force para
 * pruebas controladas (mismo patrón que `work-journal:seal-period`).
 *
 * El comando NUNCA lanza para no romper la cadena del scheduler: ante un
 * error inesperado lo loguea y devuelve exitCode 1.
 */
export default class BillingTickSubscriptions extends BaseCommand {
  static readonly commandName = 'billing:tick-subscriptions'
  static readonly description =
    'Reloj de suscripción: evalúa fechas y mueve estados trialing/active/past_due (idempotente)'

  static readonly options: CommandOptions = {
    startApp: true,
  }

  @flags.string({
    description:
      'Fecha de corte a evaluar (YYYY-MM-DD). Por default, hoy en zona de negocio (CDMX).',
  })
  declare date?: string

  @flags.boolean({
    description: 'Corre aunque NODE_ENV no sea "production" (para pruebas manuales controladas).',
  })
  declare force: boolean

  async run() {
    if (env.get('NODE_ENV') !== 'production' && this.force !== true) {
      this.logger.info(
        'billing:tick-subscriptions — se omite: el entorno no es producción (usa --force para forzar)'
      )
      this.exitCode = 1
      return
    }

    const businessDate = this.date ?? toBusinessDateString()
    this.logger.info(`billing:tick-subscriptions — inicio (corte=${businessDate})`)

    try {
      const service = new BillingSubscriptionClockService()
      const result = await service.run(businessDate)

      this.logger.info(
        `billing:tick-subscriptions — fin: corte=${result.businessDate} ` +
          `evaluadas=${result.processed} transicionadas=${result.transitioned} ` +
          `sin cambio=${result.skipped}`
      )

      for (const detail of result.details) {
        const tag = detail.idempotent ? '[idempotente]' : '[nueva]'
        this.logger.info(
          `  ${tag} sub#${detail.billingSubscriptionId} ` +
            `${detail.fromStatus} → ${detail.toStatus} (${detail.reason})`
        )
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : JSON.stringify(error)
      this.logger.error(`billing:tick-subscriptions — error fatal: ${message}`)
      this.exitCode = 1
    }
  }
}
