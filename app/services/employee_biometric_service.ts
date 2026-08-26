import EmployeeBiometric from '#models/employee_biometric'
import Employee from '#models/employee'
import { I18n } from '@adonisjs/i18n'
import { maskSensitiveDtoValue } from '#helpers/sensitive_serialize'

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

  /**
   * Inicia el proceso de enrolamiento biométrico
   * Crea o actualiza el registro con status 'enrolling'
   * - Si se envía el mismo tipo (fingers → fingers), reemplaza los existentes
   * - Si se envía un tipo diferente (fingers → face o face → fingers), combina
   * @param employeeId - ID del empleado
   * @param biometricType - Tipo biométrico: 'finger' o 'face'
   * @param fingerIds - Array de IDs de dedos (0-9). 0-4 mano izquierda, 5-9 mano derecha
   * @param removeFace - Si es true y biometricType es 'face', elimina Face ID en lugar de agregarlo
   */
  async startEnrollment(
    employeeId: number,
    biometricType: 'finger' | 'face',
    fingerIds?: number[],
    removeFace?: boolean
  ) {
    // Verificar que el empleado existe
    const employee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeId)
      .first()

    if (!employee) {
      return null
    }

    // Buscar registro existente o crear uno nuevo
    let employeeBiometric = await this.findByEmployeeId(employeeId)

    let finalFingers: number[] = []
    let finalFace = false

    if (employeeBiometric && employeeBiometric.employeeBiometricData) {
      // Si existe registro previo, parsear datos existentes
      const existingData = this.parseBiometricData(employeeBiometric.employeeBiometricData)

      if (biometricType === 'finger') {
        if (fingerIds && fingerIds.length > 0) {
          // Si se envían fingers, REEMPLAZAR los fingers existentes (no combinar)
          finalFingers = [...fingerIds].sort((a, b) => a - b)
        } else {
          // Si se envía array vacío o sin fingers, ELIMINAR todos los fingers
          finalFingers = []
        }
        // Mantener Face si ya estaba registrado
        finalFace = existingData.face
      } else if (biometricType === 'face') {
        // Si se envía Face, AGREGAR o ELIMINAR según removeFace
        finalFingers = existingData.fingers
        if (removeFace) {
          // Eliminar Face ID
          finalFace = false
        } else {
          // Agregar Face ID
          finalFace = true
        }
      } else {
        // Si no se envía nada nuevo, mantener datos existentes
        finalFingers = existingData.fingers
        finalFace = existingData.face
      }
    } else {
      // Si no existe registro previo, usar los datos nuevos directamente
      if (biometricType === 'finger' && fingerIds && fingerIds.length > 0) {
        finalFingers = [...fingerIds].sort((a, b) => a - b)
      }
      if (biometricType === 'face' && !removeFace) {
        // Solo agregar Face si no se está eliminando
        finalFace = true
      }
    }

    // Formatear datos biométricos combinados
    const biometricDataString = this.formatBiometricData(finalFingers, finalFace)

    if (!employeeBiometric) {
      // Crear nuevo registro con status 'enrolling'
      employeeBiometric = new EmployeeBiometric()
      employeeBiometric.employeeId = employeeId
      employeeBiometric.employeeBiometricData = biometricDataString
      employeeBiometric.employeeBiometricStatus = 'enrolling'
      await employeeBiometric.save()
    } else {
      // Actualizar datos combinados y status a 'enrolling'
      employeeBiometric.employeeBiometricData = biometricDataString
      employeeBiometric.employeeBiometricStatus = 'enrolling'
      await employeeBiometric.save()
    }

    return {
      employeeId,
      biometricType,
      fingerIds: finalFingers,
      face: finalFace,
      status: 'enrolling',
    }
  }

  /**
   * Actualiza el status del enrolamiento biométrico
   * Determina automáticamente el status basándose en los datos biométricos registrados
   * @param employeeId - ID del empleado
   * @param status - Status final: 'completed' o 'failed'
   */
  async updateEnrollmentStatus(employeeId: number, status: 'completed' | 'failed') {
    // Verificar que el empleado existe
    const employee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeId)
      .first()

    if (!employee) {
      return null
    }

    // Buscar registro existente
    const employeeBiometric = await this.findByEmployeeId(employeeId)

    if (!employeeBiometric) {
      return null
    }

    // Parsear datos existentes para determinar qué se completó
    const existingData = this.parseBiometricData(employeeBiometric.employeeBiometricData)

    // Determinar el status específico basándose en los datos biométricos
    let finalStatus:
      | 'completed_fingers'
      | 'completed_face'
      | 'completed_both'
      | 'failed' = 'failed'

    finalStatus = status as 'completed_fingers' | 'completed_face' | 'completed_both' | 'failed'

    // Actualizar el status con el valor específico
    employeeBiometric.employeeBiometricStatus = finalStatus
    await employeeBiometric.save()

    // Recargar el registro para asegurar que se guardó correctamente
    await employeeBiometric.refresh()

    return {
      employeeId,
      fingers: existingData.fingers,
      face: existingData.face,
      status: finalStatus,
      biometricData: maskSensitiveDtoValue('EmployeeBiometric', 'employeeBiometricData',
        employeeBiometric.employeeBiometricData
      ),
    }
  }

  /**
   * Obtiene el status actual del enrolamiento biométrico
   */
  async getEnrollmentStatus(employeeId: number) {
    // Verificar que el empleado existe
    const employee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeId)
      .first()

    if (!employee) {
      return null
    }

    // Buscar registro biométrico
    const employeeBiometric = await this.findByEmployeeId(employeeId)

    if (!employeeBiometric) {
      return {
        employeeId,
        status: 'pending',
        fingers: [],
        face: false,
        biometricData: '', // String vacío cuando no hay registro
      }
    }

    const parsed = this.parseBiometricData(employeeBiometric.employeeBiometricData)

    return {
      employeeId,
      status: employeeBiometric.employeeBiometricStatus || 'pending',
      fingers: parsed.fingers,
      face: parsed.face,
      biometricData: maskSensitiveDtoValue('EmployeeBiometric', 'employeeBiometricData',
        employeeBiometric.employeeBiometricData
      ),
    }
  }
}
