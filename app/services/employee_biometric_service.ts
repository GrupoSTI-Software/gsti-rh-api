import EmployeeBiometric from '#models/employee_biometric'
import Employee from '#models/employee'
import { I18n } from '@adonisjs/i18n'

export default class EmployeeBiometricService {
  private t: (key: string, params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  /**
   * Convierte un array de números de dedos y un booleano de face a string
   * Formato: "Finger:1, Finger:2, Face"
   */
  private formatBiometricData(fingers: number[] = [], face: boolean = false): string {
    const parts: string[] = []

    // Agregar dedos registrados
    fingers.forEach((fingerId) => {
      parts.push(`Finger:${fingerId}`)
    })

    // Agregar Face si está activo
    if (face) {
      parts.push('Face')
    }

    return parts.join(', ')
  }

  /**
   * Parsea el string de datos biométricos a objeto
   * Formato: "Finger:1, Finger:2, Face" -> { fingers: [1, 2], face: true }
   */
  parseBiometricData(data: string): { fingers: number[], face: boolean } {
    const fingers: number[] = []
    let face = false

    if (!data || data.trim() === '') {
      return { fingers: [], face: false }
    }

    const parts = data.split(',').map(part => part.trim())

    for (const part of parts) {
      if (part.startsWith('Finger:')) {
        const fingerId = Number.parseInt(part.replace('Finger:', ''), 10)
        if (!Number.isNaN(fingerId) && fingerId >= 0 && fingerId <= 9) {
          fingers.push(fingerId)
        }
      } else if (part === 'Face') {
        face = true
      }
    }

    return { fingers, face }
  }

  async findByEmployeeId(employeeId: number) {
    const employeeBiometric = await EmployeeBiometric.query()
      .whereNull('employee_biometric_deleted_at')
      .where('employee_id', employeeId)
      .first()

    return employeeBiometric
  }

  async getFingers(employeeId: number): Promise<number[]> {
    const employeeBiometric = await this.findByEmployeeId(employeeId)
    if (!employeeBiometric) {
      return []
    }

    const parsed = this.parseBiometricData(employeeBiometric.employeeBiometricData)
    return parsed.fingers
  }

  async getFaceStatus(employeeId: number): Promise<boolean> {
    const employeeBiometric = await this.findByEmployeeId(employeeId)
    if (!employeeBiometric) {
      return false
    }

    const parsed = this.parseBiometricData(employeeBiometric.employeeBiometricData)
    return parsed.face
  }

  async create(employeeId: number, fingers: number[] = [], face: boolean = false) {
    // Verificar que el empleado existe
    const employee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeId)
      .first()

    if (!employee) {
      throw new Error(this.t('entity_was_not_found', { entity: this.t('employee') }))
    }

    // Verificar si ya existe un registro para este empleado
    const existing = await this.findByEmployeeId(employeeId)
    if (existing) {
      throw new Error(this.t('biometric_record_already_exists'))
    }

    const biometricData = this.formatBiometricData(fingers, face)

    const employeeBiometric = new EmployeeBiometric()
    employeeBiometric.employeeId = employeeId
    employeeBiometric.employeeBiometricData = biometricData
    await employeeBiometric.save()

    return employeeBiometric
  }

  async update(employeeId: number, fingers: number[] | null = null, face: boolean | null = null) {
    const employeeBiometric = await this.findByEmployeeId(employeeId)

    if (!employeeBiometric) {
      throw new Error(this.t('biometric_record_not_found'))
    }

    // Si se proporcionan nuevos valores, actualizar; si no, mantener los existentes
    const current = this.parseBiometricData(employeeBiometric.employeeBiometricData)
    const newFingers = fingers !== null ? fingers : current.fingers
    const newFace = face !== null ? face : current.face

    const biometricData = this.formatBiometricData(newFingers, newFace)
    employeeBiometric.employeeBiometricData = biometricData
    await employeeBiometric.save()

    return employeeBiometric
  }

  async updateFingers(employeeId: number, fingers: number[]) {
    return this.update(employeeId, fingers, null)
  }

  async updateFaceStatus(employeeId: number, face: boolean) {
    return this.update(employeeId, null, face)
  }

  async delete(employeeId: number) {
    const employeeBiometric = await this.findByEmployeeId(employeeId)

    if (!employeeBiometric) {
      throw new Error(this.t('biometric_record_not_found'))
    }

    await employeeBiometric.delete()
    return employeeBiometric
  }
}
