import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import AttendanceFaultHrNotificationService from '#services/attendance_fault_hr_notification_service'

/**
 * Envía correo a usuarios activos con roles configurados (y empleado asociado por person_id),
 * usando user_email.
 * cuando colaboradores exceden el plazo Fault sin registro de entrada.
 * Ejecutar vía CRON (p. ej. cada minuto). Los ya notificados no se repiten (tabla de log).
 */
export default class NotifyAttendanceFaultHr extends BaseCommand {
  static commandName = 'notify:attendance-fault-hr'
  static description =
    'Notifica por correo (RH) empleados sin registro de entrada tras vencer la tolerancia Fault'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    this.logger.info('Inicio: notificación de faltas por asistencia a RH')
    const service = new AttendanceFaultHrNotificationService()
    const result = await service.run({
      info: (m) => this.logger.info(m),
      error: (m) => this.logger.error(m),
      warning: (m) => this.logger.warning(m),
    })
    if (result.sent) {
      this.logger.info(`Proceso finalizado: correo enviado (${result.count} empleado(s))`)
    } else {
      this.logger.info(`Proceso finalizado sin envío (motivo: ${result.reason})`)
    }
  }
}
