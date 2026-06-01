import ExceptionType from '#models/exception_type'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'

/**
 * Tipo de excepción "Lactancia" usado por el motor de excepciones cuando se
 * genera una jornada reducida a partir de un periodo de lactancia
 * (`employee_lactation_periods`).
 *
 * Slug estable: `lactancia`. `ShiftExceptionService.generateForLactationPeriod`
 * lo busca por slug; si no existe se lanza 500
 * `lactation-exception-type-missing` y la transacción del periodo hace rollback.
 *
 * `firstOrCreate` por slug → idempotente en re-ejecuciones del seeder.
 */
export default class extends BaseSeeder {
  async run() {
    await ExceptionType.firstOrCreate(
      { exceptionTypeSlug: 'lactancia' },
      {
        exceptionTypeTypeName: 'Lactancia',
        exceptionTypeIcon: 'icon_lactation',
        exceptionTypeIsGeneral: 0,
        exceptionTypeNeedCheckInTime: 1,
        exceptionTypeNeedCheckOutTime: 1,
        exceptionTypeNeedReason: 0,
        exceptionTypeNeedEnjoymentOfSalary: 0,
        exceptionTypeNeedPeriodInDays: 0,
        exceptionTypeNeedPeriodInHours: 0,
        exceptionTypeActive: 1,
        exceptionTypeCanMasive: false,
        // Las excepciones de lactancia se generan automáticamente desde el
        // periodo en `employee_lactation_periods`; la empleada NO las solicita
        // por sí misma desde el portal de excepciones. Por eso este flag queda
        // explícitamente en `false` para que el listado del portal de empleada
        // no lo ofrezca, mientras el listado de admin lo sigue mostrando.
        exceptionTypeCanEmployeeRequests: true,
        exceptionTypeCreatedAt: DateTime.now(),
      }
    )
  }
}
