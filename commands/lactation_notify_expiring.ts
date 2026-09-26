import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import EmployeeLactationNotificationService from '#services/employee_lactation_notification_service'
import { LACTATION_NOTIFY_EXPIRING_COMMAND } from '#constants/employee_lactation_notification'

/**
 * Comando agendado: detecta periodos de lactancia ACTIVOS cuyo `end`
 * cae dentro de los próximos 30 días y NO tienen aviso `expiring`
 * previo en bitácora; agrupa por empresa, envía un único correo a los
 * destinatarios configurados y registra el envío (idempotente).
 *
 * Disparo normal: scheduler (ver `start/scheduler.ts`).
 * Disparo manual: `node ace lactation:notify-expiring` o endpoint
 * `POST /api/employee-lactation-periods/notifications/run-expiring-check`.
 *
 * El comando NUNCA lanza para no romper la cadena del scheduler ante
 * un fallo puntual: ante error, lo loguea como `error` y devuelve
 * exit 1.
 */
export default class LactationNotifyExpiring extends BaseCommand {
  static commandName = LACTATION_NOTIFY_EXPIRING_COMMAND
  static description =
    'Notifica a RH por correo los periodos de lactancia que vencen en los próximos 30 días (idempotente)'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    this.logger.info('Inicio: aviso de vencimiento de periodos de lactancia')
    const service = new EmployeeLactationNotificationService()
    try {
      const result = await service.runExpiringCheck({
        info: (m, meta) => this.logger.info(meta ? `${m} ${JSON.stringify(meta)}` : m),
        warn: (m, meta) => this.logger.warning(meta ? `${m} ${JSON.stringify(meta)}` : m),
        error: (m, meta) => this.logger.error(meta ? `${m} ${JSON.stringify(meta)}` : m),
      })

      this.logger.info(
        `Proceso finalizado: ${result.sentCount} aviso(s) enviados, ` +
          `${result.skippedAlreadyNotified} omitido(s) por idempotencia, ` +
          `${result.companiesNotified} empresa(s) notificada(s), ` +
          `${result.companiesWithoutRecipients.length} empresa(s) sin destinatarios, ` +
          `${result.companiesWithMailErrors.length} empresa(s) con error de envío`
      )
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      this.logger.error(`Error fatal en aviso de lactancia: ${message}`)
      this.exitCode = 1
    }
  }
}
