import EmployeeType from '#models/employee_type'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'

export default class extends BaseSeeder {
  async run() {
    const dateTime = DateTime.now()

    const employeeTypes = [
      {
        employeeTypeId: 1,
        employeeTypeName: 'Empleado',
        employeeTypeSlug: 'employee',
        businessUnitId: 1
      }
    ]

    for (const employeeType of employeeTypes) {
      const { employeeTypeId, ...employeeTypeData } = employeeType
      await EmployeeType.firstOrCreate(
        { employeeTypeId },
        {
          ...employeeTypeData,
          employeeTypeCreatedAt: dateTime,
          employeeTypeUpdatedAt: dateTime,
        }
      )
    }
  }
}
