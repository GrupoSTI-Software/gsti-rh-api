import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import AttendanceFaultHrNotificationService from '#services/attendance_fault_hr_notification_service'

/**
 * Envía correo a usuarios activos con roles configurados (y empleado asociado por person_id),
 * usando user_email.
 * cuando colaboradores exceden el plazo Fault sin registro de entrada.
 * Ejecutar vía CRON (p. ej. cada minuto). Los ya notificados no se repiten (tabla de log).
 *
 * Modo prueba: `node ace notify:attendance-fault-hr --test` envía al rol ELGUESO una vista
 * como si todos los colaboradores elegibles del día tuvieran falta (sin escribir en el log).
 */
export default class NotifyAttendanceFaultHr extends BaseCommand {
  static commandName = 'notify:attendance-fault-hr'
  static description =
    'Notifica por correo (RH) empleados sin registro de entrada tras vencer la tolerancia Fault'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({
    description:
      'Prueba: correo solo al rol ELGUESO, simulando faltas de todos los colaboradores elegibles del día (sin registrar en log)',
    alias: 't',
  })
  declare test: boolean

  async run() {
    const isTest = this.test === true
    this.logger.info(
      isTest
        ? 'Inicio: notificación de prueba (rol ELGUESO, faltas simuladas)'
        : 'Inicio: notificación de faltas por asistencia a RH'
    )
    const service = new AttendanceFaultHrNotificationService()
    const result = await service.run(
      {
        info: (m) => this.logger.info(m),
        error: (m) => this.logger.error(m),
        warning: (m) => this.logger.warning(m),
      },
      { test: isTest }
    )
    if (result.sent) {
      const companiesLabel =
        result.processedSettings === 1
          ? '1 empresa'
          : `${result.processedSettings} empresas`
      const errorsSuffix =
        result.failedSettings > 0
          ? `; ${result.failedSettings} empresa(s) con error`
          : ''
      this.logger.info(
        isTest
          ? `Proceso de prueba finalizado: correo enviado (${result.count} empleado(s) en la tabla simulada, ${result.sentSettings}/${companiesLabel}${errorsSuffix})`
          : `Proceso finalizado: correo enviado (${result.count} empleado(s), ${result.sentSettings}/${companiesLabel}${errorsSuffix})`
      )
    } else {
      const errorsSuffix =
        result.failedSettings > 0
          ? `, ${result.failedSettings} con error`
          : ''
      this.logger.info(
        `Proceso finalizado sin envío (${result.processedSettings} empresa(s) evaluada(s)${errorsSuffix}, motivo: ${result.reason})`
      )
    }
  }
}
