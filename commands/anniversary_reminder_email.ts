import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import {
  ANNIVERSARY_REMINDER_EMAIL_COMMAND,
  EMPLOYEE_CELEBRATION_EMAIL_KIND,
  EMPLOYEE_CELEBRATION_RUN_UNSCOPED_REASONS,
} from '#constants/employee_celebration_email'
import EmployeeCelebrationEmailService from '#services/employee_celebration_email_service'
import { TenantContext } from '#utils/tenant_context'

export default class AnniversaryReminderEmail extends BaseCommand {
  static commandName = ANNIVERSARY_REMINDER_EMAIL_COMMAND
  static description =
    'Send anniversary reminder emails to HR users about employees celebrating their work anniversary today'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    this.logger.info('Inicio: recordatorio de aniversario laboral a RH')
    const service = new EmployeeCelebrationEmailService()
    try {
      const result = await TenantContext.runUnscoped(
        () =>
          service.run(EMPLOYEE_CELEBRATION_EMAIL_KIND.ANNIVERSARY_HR_REMINDER, {
            info: (m) => this.logger.info(m),
            error: (m) => this.logger.error(m),
            warning: (m) => this.logger.warning(m),
          }),
        EMPLOYEE_CELEBRATION_RUN_UNSCOPED_REASONS[
          EMPLOYEE_CELEBRATION_EMAIL_KIND.ANNIVERSARY_HR_REMINDER
        ]
      )

      if (result.sent) {
        this.logger.info(
          `Proceso finalizado: ${result.totalEmailsSent} correo(s) enviado(s) (${result.sentSettings}/${result.processedSettings} empresa(s))`
        )
      } else {
        this.logger.info(
          `Proceso finalizado sin envío (${result.processedSettings} empresa(s) evaluada(s), motivo: ${result.reason})`
        )
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      this.logger.error(`Error fatal en recordatorio de aniversario a RH: ${message}`)
      this.exitCode = 1
    }
  }
}
