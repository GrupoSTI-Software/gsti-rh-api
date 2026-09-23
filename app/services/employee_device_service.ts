import Employee from '#models/employee'
import EmployeeDevice from '#models/employee_device'
import { I18n } from '@adonisjs/i18n'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'

/** Datos del celular con los que la app inicia sesión. */
export interface DeviceBindingInput {
  employeeDeviceToken: string
  employeeDeviceModel: string
  employeeDeviceBrand: string
  employeeDeviceType: string
  employeeDeviceOs: string
  employeeId: number
}

/**
 * Resultado de amarrar el celular al colaborador que inicia sesión.
 * - `bound`: el celular ya era suyo o se registró por primera vez.
 * - `inactive`: es suyo pero RH lo desactivó; la sesión no procede.
 * - `transferred`: era de otro colaborador y pasó a este. `previousOwnerUsedItLast`
 *   indica si ese celular era el equipo más reciente del dueño anterior, es decir,
 *   si su sesión de la app vivía ahí.
 */
export type DeviceBindingResult =
  | { status: 'bound'; device: EmployeeDevice }
  | { status: 'inactive' }
  | {
      status: 'transferred'
      device: EmployeeDevice
      previousEmployeeId: number
      previousOwnerUsedItLast: boolean
    }

export default class EmployeeDeviceService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }
  async create(
    employeeDevice: Pick<EmployeeDevice, keyof DeviceBindingInput>,
    trx?: TransactionClientContract
  ) {
    const newEmployeeDevice = new EmployeeDevice()
    if (trx) newEmployeeDevice.useTransaction(trx)
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

  async delete(currentemployeeDevice: EmployeeDevice, trx?: TransactionClientContract) {
    if (trx) currentemployeeDevice.useTransaction(trx)
    if (typeof currentemployeeDevice.employeeDeviceToken === 'string' && currentemployeeDevice.employeeDeviceToken.length > 0) {
      const timestamp = DateTime.now().toMillis().toString()
      if (!currentemployeeDevice.employeeDeviceToken.includes('---deleted--')) {
        currentemployeeDevice.employeeDeviceToken = `${currentemployeeDevice.employeeDeviceToken}---deleted--${timestamp}`
      } else {
        currentemployeeDevice.employeeDeviceToken = `${currentemployeeDevice.employeeDeviceToken}---${timestamp}`
      }
      await currentemployeeDevice.save()
    }
    await currentemployeeDevice.delete()
    return currentemployeeDevice
  }

  /**
   * Amarra el celular al colaborador que acaba de iniciar sesión en la app.
   *
   * Un celular pertenece al último colaborador que entró en él. Si era de otro,
   * su registro se da de baja con `delete` (que conserva el token original como
   * prefijo) y se crea uno nuevo para quien entra: ese historial es el rastro
   * con el que RH detecta celulares que rotan entre personas. Solo debe
   * llamarse después de validar la contraseña.
   */
  async bindToEmployee(input: DeviceBindingInput): Promise<DeviceBindingResult> {
    const current = await EmployeeDevice.query()
      .where('employee_device_token', input.employeeDeviceToken)
      .first()

    if (current && current.employeeId === input.employeeId) {
      if (current.employeeDeviceActive !== 1) return { status: 'inactive' }
      return { status: 'bound', device: current }
    }

    if (!current) {
      return { status: 'bound', device: await this.create(input) }
    }

    const previousEmployeeId = current.employeeId
    const latestOfPreviousOwner = await EmployeeDevice.query()
      .where('employee_id', previousEmployeeId)
      .orderBy('employee_device_created_at', 'desc')
      .orderBy('employee_device_id', 'desc')
      .first()
    const previousOwnerUsedItLast =
      latestOfPreviousOwner?.employeeDeviceId === current.employeeDeviceId

    const device = await db.transaction(async (trx) => {
      await this.delete(current, trx)
      return this.create(input, trx)
    })

    return { status: 'transferred', device, previousEmployeeId, previousOwnerUsedItLast }
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

  async index(employeeId?: number) {
    let query = EmployeeDevice.query()
      .whereNull('employee_device_deleted_at')
      .orderBy('employee_device_created_at', 'desc')

    if (employeeId) {
      query = query.where('employee_id', employeeId) as typeof query
    }

    const employeeDevices = await query
    return employeeDevices
  }

  async updateStatus(
    currentEmployeeDevice: EmployeeDevice,
    employeeDeviceActive: number
  ) {
    currentEmployeeDevice.employeeDeviceActive = employeeDeviceActive
    await currentEmployeeDevice.save()
    return currentEmployeeDevice
  }
}
