import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import i18nManager from '@adonisjs/i18n/services/main'
import {
  NOTICE_SEND_SCHEDULED_COMMAND,
  NOTICE_SEND_SCHEDULED_UNSCOPED_REASON,
} from '#constants/notice'
import NoticeService from '#services/notice_service'
import { TenantContext } from '#utils/tenant_context'

/**
 * Comando agendado: envía los avisos programados cuya hora ya llegó.
 *
 * Corre cada minuto sin solaparse (ver `start/scheduler.ts`). Fuera de una
 * request no hay TenantContext, así que abre el bypass auditado: el barrido
 * cubre todas las empresas y cada aviso ya trae la suya persistida para el
 * branding del correo.
 *
 * Nunca lanza para no romper la cadena del scheduler: ante un fallo lo
 * registra y devuelve exit 1.
 */
export default class NoticesSendScheduled extends BaseCommand {
  static commandName = NOTICE_SEND_SCHEDULED_COMMAND
  static description = 'Envía los avisos programados cuya fecha y hora de envío ya se alcanzó'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const service = new NoticeService(i18nManager.locale(i18nManager.defaultLocale))
    try {
      const result = await TenantContext.runUnscoped(
        () =>
          service.sendDueScheduled({
            info: (message) => this.logger.info(message),
            warn: (message) => this.logger.warning(message),
            error: (message) => this.logger.error(message),
          }),
        NOTICE_SEND_SCHEDULED_UNSCOPED_REASON
      )
      if (result.dueCount > 0) {
        this.logger.info(
          `Avisos programados: ${result.dueCount} vencido(s), ${result.sentCount} enviado(s), ${result.failedCount} fallido(s)`
        )
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      this.logger.error(`Error fatal al enviar avisos programados: ${message}`)
      this.exitCode = 1
    }
  }
}
