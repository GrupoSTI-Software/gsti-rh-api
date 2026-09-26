import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import {
  ANNIVERSARY_DAY_EMAIL_COMMAND,
  EMPLOYEE_CELEBRATION_EMAIL_KIND,
  EMPLOYEE_CELEBRATION_RUN_UNSCOPED_REASONS,
} from '#constants/employee_celebration_email'
import EmployeeCelebrationEmailService from '#services/employee_celebration_email_service'
import { TenantContext } from '#utils/tenant_context'

export default class AnniversaryEmail extends BaseCommand {
  static commandName = ANNIVERSARY_DAY_EMAIL_COMMAND
  static description =
    'Send anniversary emails to employees who are celebrating their work anniversary today'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    this.logger.info('Inicio: felicitación de aniversario laboral a empleados')
    const service = new EmployeeCelebrationEmailService()
    try {
      const result = await TenantContext.runUnscoped(
        () =>
          service.run(EMPLOYEE_CELEBRATION_EMAIL_KIND.ANNIVERSARY_EMPLOYEE, {
            info: (m) => this.logger.info(m),
            error: (m) => this.logger.error(m),
            warning: (m) => this.logger.warning(m),
          }),
        EMPLOYEE_CELEBRATION_RUN_UNSCOPED_REASONS[
          EMPLOYEE_CELEBRATION_EMAIL_KIND.ANNIVERSARY_EMPLOYEE
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
      this.logger.error(`Error fatal en felicitación de aniversario: ${message}`)
      this.exitCode = 1
    }
  }
}
