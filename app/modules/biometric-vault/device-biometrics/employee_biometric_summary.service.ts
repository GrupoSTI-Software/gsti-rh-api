import { BIO_TYPE } from '../biometric_vault.constants.js'
import TemplateService from '../template/template.service.js'
import EmployeeBiometric from '#models/employee_biometric'
import { parseBiometricData } from '#helpers/biometric_data_parser'

/** Que biometricos tiene el colaborador, sin importar por donde entraron. */
export interface EmployeeBiometricSummary {
  /** Dedos con dato, en la numeracion del equipo (0 a 9), ordenados. */
  fingers: number[]
  /** Tiene plantilla facial en algun equipo. */
  face: boolean
}

/**
 * Los biometricos del colaborador vistos desde las DOS fuentes que conviven.
 *
 * La boveda (`biometric_templates`) es donde aterriza todo lo que sube un
 * checador por el canal ADMS. La tabla vieja (`employee_biometrics`) guarda lo
 * que dejo el conector de BioTime, en texto y sin plantilla.
 *
 * Preguntar solo a una deja fuera a la mitad de los clientes: quien ya migro al
 * canal veria cero dedos con la huella dentro del aparato, y quien sigue con el
 * conector perderia de vista lo que lleva años registrado. Por eso se unen, y
 * por eso este servicio existe en vez de que la pantalla elija una.
 */
export default class EmployeeBiometricSummaryService {
  private readonly templates: TemplateService

  constructor(templates?: TemplateService) {
    this.templates = templates ?? new TemplateService()
  }

  /**
   * Union de las dos fuentes.
   *
   * Un dedo que este en ambas cuenta una sola vez: es el mismo dedo de la misma
   * persona, y contarlo dos veces convertiria "2 de 10" en "4 de 10" para quien
   * fue migrado del conector al canal.
   */
  async of(employeeId: number): Promise<EmployeeBiometricSummary> {
    const slots = await this.templates.occupiedSlots(employeeId)

    const fingers = new Set<number>()
    let face = false
    for (const slot of slots) {
      if (slot.bioType === BIO_TYPE.FINGERPRINT) fingers.add(slot.bioNo)
      if (slot.bioType === BIO_TYPE.FACE) face = true
    }

    const record = await EmployeeBiometric.query()
      .whereNull('employee_biometric_deleted_at')
      .where('employee_id', employeeId)
      .first()
    if (record) {
      const parsed = parseBiometricData(record.employeeBiometricData)
      for (const finger of parsed.fingers) fingers.add(finger)
      face = face || parsed.face
    }

    return { fingers: [...fingers].sort((a, b) => a - b), face }
  }
}
