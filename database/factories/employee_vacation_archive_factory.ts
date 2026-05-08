import factory from '@adonisjs/lucid/factories'
import EmployeeVacationArchive from '#models/employee_vacation_archive'

/**
 * Archivo de vacaciones del empleado (antigüedad ↔ días de ley).
 * Requiere `.merge({ employeeId, vacationSettingId })`.
 */
export const EmployeeVacationArchiveFactory = factory
  .define(EmployeeVacationArchive, () => {
    return {
      employeeId: 0,
      vacationSettingId: 0,
    }
  })
  .build()
