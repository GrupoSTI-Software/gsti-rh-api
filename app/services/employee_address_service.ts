import Address from '#models/address'
import Employee from '#models/employee'
import EmployeeAddress from '#models/employee_address'
import { I18n } from '@adonisjs/i18n'

export default class EmployeeAddressService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  async create(employeeAddress: EmployeeAddress) {
    const newEmployeeAddress = new EmployeeAddress()
    newEmployeeAddress.employeeId = employeeAddress.employeeId
    newEmployeeAddress.addressId = employeeAddress.addressId
    await newEmployeeAddress.save()
    await newEmployeeAddress.load('address')
    return newEmployeeAddress
  }

  async update(currentEmployeeAddress: EmployeeAddress, employeeAddress: EmployeeAddress) {
    currentEmployeeAddress.employeeId = employeeAddress.employeeId
    currentEmployeeAddress.addressId = employeeAddress.addressId
    await currentEmployeeAddress.save()
    return currentEmployeeAddress
  }

  async delete(currentEmployeeAddress: EmployeeAddress) {
    await currentEmployeeAddress.delete()
    return currentEmployeeAddress
  }

  async show(employeeAddressId: number) {
    const employeeAddress = await EmployeeAddress.query()
      .whereNull('employee_address_deleted_at')
      .where('employee_address_id', employeeAddressId)
      .preload('address', async (query) => {
        query.preload('addressType')
      })
      .first()
    return employeeAddress ? employeeAddress : null
  }

  async index() {
    const employeeAddress = await EmployeeAddress.query()
      .whereNull('employee_address_deleted_at')
      .first()
    return employeeAddress ? employeeAddress : null
  }

  async verifyInfoExist(employeeAddress: EmployeeAddress) {
    const existEmployee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeAddress.employeeId)
      .first()

    if (!existEmployee && employeeAddress.employeeId) {
      const entity = this.t('employee')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...employeeAddress },
      }
    }

    const existAddress = await Address.query()
      .whereNull('address_deleted_at')
      .where('address_id', employeeAddress.addressId)
      .first()

    if (!existAddress && employeeAddress.addressId) {
      const entity = this.t('address')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...employeeAddress },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...employeeAddress },
    }
  }
}
