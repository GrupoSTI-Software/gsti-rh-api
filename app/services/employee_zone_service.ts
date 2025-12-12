import Employee from '#models/employee'
import EmployeeZone from '#models/employee_zone'
import Zone from '#models/zone'
import { I18n } from '@adonisjs/i18n'

export default class EmployeeZoneService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }
  async create(employeeZone: EmployeeZone) {
    const newEmployeeZone = new EmployeeZone()
    newEmployeeZone.employeeId = employeeZone.employeeId
    newEmployeeZone.zoneId = employeeZone.zoneId
    await newEmployeeZone.save()
    return newEmployeeZone
  }

  async update(currentEmployeeZone: EmployeeZone, employeeZone: EmployeeZone) {
    currentEmployeeZone.employeeId = employeeZone.employeeId
    currentEmployeeZone.zoneId = employeeZone.zoneId
    await currentEmployeeZone.save()
    return currentEmployeeZone
  }

  async delete(currentEmployeeZone: EmployeeZone) {
    await currentEmployeeZone.delete()
    return currentEmployeeZone
  }

  async show(employeeZoneId: number) {
    const employeeZone = await EmployeeZone.query()
      .whereNull('employee_zone_deleted_at')
      .where('employee_zone_id', employeeZoneId)
      .first()
    return employeeZone ? employeeZone : null
  }

  async verifyInfoExist(employeeZone: EmployeeZone) {
    const existEmployee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeZone.employeeId)
      .first()

    if (!existEmployee && employeeZone.employeeId) {
      const entity = this.t('employee')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...employeeZone },
      }
    }
    const existZone = await Zone.query()
      .whereNull('zone_deleted_at')
      .where('zone_id', employeeZone.zoneId)
      .first()

    if (!existZone && employeeZone.zoneId) {
      const entity = this.t('zone')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...employeeZone },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...employeeZone },
    }
  }
}
