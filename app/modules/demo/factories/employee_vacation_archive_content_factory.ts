import factory from '@adonisjs/lucid/factories'
import EmployeeVacationArchiveContent from '#models/employee_vacation_archive_content'

/**
 * Contenido/documento asociado a un archivo de vacaciones.
 * Requiere `.merge({ employeeVacationArchiveId })`.
 */
export const EmployeeVacationArchiveContentFactory = factory
  .define(EmployeeVacationArchiveContent, ({ faker }) => {
    return {
      employeeVacationArchiveId: 0,
      employeeVacationArchiveContentDescription: `Constancia demo ${faker.lorem.words(3)}`,
      employeeVacationArchiveContentFile: `/storage/demo/vacaciones-${faker.string.uuid()}.pdf`,
      employeeVacationArchiveContentActive: true,
    }
  })
  .build()
