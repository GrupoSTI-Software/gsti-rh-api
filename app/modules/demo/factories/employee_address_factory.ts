import factory from '@adonisjs/lucid/factories'
import EmployeeAddress from '#models/employee_address'

/**
 * Relación empleado ↔ dirección. Requiere `.merge({ employeeId, addressId })`.
 */
export const EmployeeAddressFactory = factory
  .define(EmployeeAddress, () => {
    return {
      employeeId: 0,
      addressId: 0,
    }
  })
  .build()
