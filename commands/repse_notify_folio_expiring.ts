import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import RepseFolioAvisoService from '#services/repse_folio_aviso_service'
import { REPSE_NOTIFY_FOLIO_EXPIRING_COMMAND } from '#constants/repse_folio_aviso'

/**
 * Comando agendado: detecta registros REPSE activos con avisos de
 * renovación (90 días antes de expiresAt) o informativa (15 días antes
 * del 17 ene/may/sep) pendientes; agrupa por empresa, envía correo a
 * destinatarios configurados y registra la bitácora (idempotente).
 *
 * El comando NUNCA lanza para no romper la cadena del scheduler.
 */
export default class RepseNotifyFolioExpiring extends BaseCommand {
  static commandName = REPSE_NOTIFY_FOLIO_EXPIRING_COMMAND
  static description =
    'Notifica por correo la vigencia del folio REPSE (renovación e informativas cuatrimestrales, idempotente)'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    this.logger.info('Inicio: aviso de vigencia del folio REPSE')
    const service = new RepseFolioAvisoService()
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
      this.logger.error(`Error fatal en aviso de vigencia REPSE: ${message}`)
      this.exitCode = 1
    }
  }
}
