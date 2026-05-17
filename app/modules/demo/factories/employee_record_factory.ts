import factory from '@adonisjs/lucid/factories'
import EmployeeRecord from '#models/employee_record'

/**
 * Registro de expediente del empleado (idiomas, escolaridad, etc.).
 * Requiere `.merge({ employeeId, employeeRecordPropertyId })` usando propiedades
 * del seeder `0010_employee_record_property_seeder`.
 */
export const EmployeeRecordFactory = factory
  .define(EmployeeRecord, ({ faker }) => {
    return {
      employeeRecordPropertyId: 1,
      employeeId: 0,
      employeeRecordValue: `${faker.helpers.arrayElement(['Inglés', 'Francés', 'Portugués'])}/${faker.helpers.arrayElement(['Básico', 'Medio', 'Avanzado'])}`,
      employeeRecordActive: 1,
    }
  })
  .build()
