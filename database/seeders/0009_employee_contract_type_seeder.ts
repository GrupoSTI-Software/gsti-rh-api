import EmployeeContractType from '#models/employee_contract_type'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'

export default class extends BaseSeeder {
  async run() {
    const dateTime = DateTime.now()

    const contractTypes = [
      {
        employeeContractTypeId: 1,
        employeeContractTypeName: 'Permanente',
        employeeContractTypeDescription: 'Permanente',
        employeeContractTypeSlug: 'permanente',
      },
      {
        employeeContractTypeId: 2,
        employeeContractTypeName: 'Temporal',
        employeeContractTypeDescription: 'Temporal',
        employeeContractTypeSlug: 'temporal',
      },
      {
        employeeContractTypeId: 3,
        employeeContractTypeName: 'Practicante',
        employeeContractTypeDescription: 'Practicante',
        employeeContractTypeSlug: 'practicante',
      }
    ]

    for (const contractType of contractTypes) {
      const { employeeContractTypeId, ...contractTypeData } = contractType
      await EmployeeContractType.firstOrCreate(
        { employeeContractTypeId },
        {
          ...contractTypeData,
          employeeContractTypeCreatedAt: dateTime,
          employeeContractTypeUpdatedAt: dateTime,
        }
      )
    }
  }
}
