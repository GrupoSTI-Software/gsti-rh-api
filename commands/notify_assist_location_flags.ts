import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import AssistLocationFlagDigestService from '#modules/assist-location-flag/assist_location_flag_digest.service'
import { ASSIST_LOCATION_FLAG_NOTIFY_COMMAND } from '#constants/assist_location_flag_digest'

/**
 * Comando agendado: avisa por correo a RH, una vez por empresa, las checadas
 * que el teléfono reportó con ubicación simulada y que todavía no se avisaron
 * (VLRH-H1791056340278).
 *
 * Disparo normal: scheduler (ver `start/scheduler.ts`), cada hora.
 * Disparo manual: `node ace assist:notify-location-flags`.
 *
 * Una empresa que falla no detiene a las demás y no cambia el código de
 * salida: el servicio la aísla y la registra. El comando NUNCA lanza; solo un
 * fallo fuera del recorrido de empresas termina con exit 1. La bitácora lleva
 * la clase del error, no su mensaje.
 */
export default class NotifyAssistLocationFlags extends BaseCommand {
  static commandName = ASSIST_LOCATION_FLAG_NOTIFY_COMMAND
  static description =
    'Avisa por correo a RH las checadas con ubicación simulada pendientes de avisar (cada hora)'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    try {
      const result = await new AssistLocationFlagDigestService().run()
      this.logger.info(
        `Aviso de ubicación simulada: ${result.companiesNotified} empresa(s) notificada(s), ` +
          `${result.assistsNotified} registro(s) avisado(s), ` +
          `${result.companiesWithoutRecipients} sin destinatarios, ` +
          `${result.companiesSimulated} con envío simulado, ` +
          `${result.companiesFailed} con error`
      )
    } catch (error: unknown) {
      const errorClass = error instanceof Error ? error.constructor.name : typeof error
      this.logger.error(`Error fatal en el aviso de ubicación simulada: ${errorClass}`)
      this.exitCode = 1
    }
  }
}
