import Employee from '#models/employee'
import EmployeeDevice from '#models/employee_device'
import { I18n } from '@adonisjs/i18n'

export default class EmployeeDeviceService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }
  async create(employeeDevice: EmployeeDevice) {
    const newEmployeeDevice = new EmployeeDevice()
    newEmployeeDevice.employeeDeviceToken = employeeDevice.employeeDeviceToken
    newEmployeeDevice.employeeDeviceModel = employeeDevice.employeeDeviceModel
    newEmployeeDevice.employeeDeviceBrand = employeeDevice.employeeDeviceBrand
    newEmployeeDevice.employeeDeviceType = employeeDevice.employeeDeviceType
    newEmployeeDevice.employeeDeviceOs = employeeDevice.employeeDeviceOs
    newEmployeeDevice.employeeId = employeeDevice.employeeId
    await newEmployeeDevice.save()
    return newEmployeeDevice
  }

  async update(currentEmployeeDevice: EmployeeDevice, employeeDevice: EmployeeDevice) {
    currentEmployeeDevice.employeeDeviceModel = employeeDevice.employeeDeviceModel
    currentEmployeeDevice.employeeDeviceBrand = employeeDevice.employeeDeviceBrand
    currentEmployeeDevice.employeeDeviceType = employeeDevice.employeeDeviceType
    currentEmployeeDevice.employeeDeviceOs = employeeDevice.employeeDeviceOs
    await currentEmployeeDevice.save()
    return currentEmployeeDevice
  }

  async delete(currentemployeeDevice: EmployeeDevice) {
    await currentemployeeDevice.delete()
    return currentemployeeDevice
  }

  async show(employeeDeviceId: number) {
    const employeeDevice = await EmployeeDevice.query()
      .whereNull('employee_device_deleted_at')
      .where('employee_device_id', employeeDeviceId)
      .first()
    return employeeDevice ? employeeDevice : null
  }

  async verifyInfoExist(employeeDevice: EmployeeDevice) {
    const existEmployee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeDevice.employeeId)
      .first()

    if (!existEmployee && employeeDevice.employeeId) {
      const entity = this.t('employee')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...employeeDevice },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...employeeDevice },
    }
  }

}
