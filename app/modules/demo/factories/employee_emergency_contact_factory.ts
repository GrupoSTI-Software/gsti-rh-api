import factory from '@adonisjs/lucid/factories'
import EmployeeEmergencyContact from '#models/employee_emergency_contact'

/**
 * Contacto de emergencia del empleado. Requiere `.merge({ employeeId })`.
 */
export const EmployeeEmergencyContactFactory = factory
  .define(EmployeeEmergencyContact, ({ faker }) => {
    return {
      employeeId: 0,
      employeeEmergencyContactFirstname: faker.person.firstName(),
      employeeEmergencyContactLastname: faker.person.lastName(),
      employeeEmergencyContactSecondLastname: faker.person.lastName(),
      employeeEmergencyContactRelationship: faker.helpers.arrayElement([
        'Padre',
        'Madre',
        'Cónyuge',
        'Hermano/a',
        'Amigo/a',
      ]),
      employeeEmergencyContactPhone: faker.string.numeric(10),
      employeeEmergencyContactIsPrimary: true,
    }
  })
  .build()
