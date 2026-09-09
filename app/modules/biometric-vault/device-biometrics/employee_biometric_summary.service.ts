import AccessPointProfile from '#models/access_point_profile'
import DeviceCommand from '#models/device_command'
import EmployeeBiometric from '#models/employee_biometric'
import { parseBiometricData } from '#helpers/biometric_data_parser'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import { BIO_TYPE } from '../biometric_vault.constants.js'
import TemplateService from '../template/template.service.js'
import {
  BIOMETRIC_SLOT_STATE,
  betterState,
  resolveSlotState,
} from './biometric_slot_state.js'
import type { BiometricSlotState } from './biometric_slot_state.js'
import type { TemplateSlot } from '../template/template.repository.js'

export interface BiometricFingerState {
  fingerId: number
  state: BiometricSlotState
}

/** Que biometricos tiene el colaborador, sin importar por donde entraron. */
export interface EmployeeBiometricSummary {
  fingers: BiometricFingerState[]
  face: { registered: boolean; state: BiometricSlotState | null }
  /** Equipo contra el que se resolvieron los estados; `null` si es el consolidado. */
  scopedToAccessPointId: number | null
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
 * conector perderia de vista lo que lleva años registrado. Por eso se unen.
 *
 * Y con un equipo de por medio la respuesta cambia: un dedo no esta "registrado"
 * a secas, esta registrado EN un aparato. La boveda guarda un dato por dedo y
 * version --no uno por equipo-- asi que un template capturado en un checador no
 * dice nada de lo que hay dentro de otro. Contestar que si lo dice es lo que
 * hace que alguien llegue a marcar donde no puede.
 */
export default class EmployeeBiometricSummaryService {
  private readonly templates: TemplateService

  constructor(templates?: TemplateService) {
    this.templates = templates ?? new TemplateService()
  }

  /**
   * Que biometricos tiene el colaborador.
   *
   * @param accessPointId Equipo contra el que se resuelve cada estado. Sin el,
   *   se responde el consolidado del expediente.
   */
  async of(employeeId: number, accessPointId?: number): Promise<EmployeeBiometricSummary> {
    const slots = await this.templates.occupiedSlots(employeeId)
    const legacy = await this.legacyOf(employeeId)

    if (accessPointId === undefined) {
      return this.consolidated(slots, legacy)
    }

    return this.scoped(slots, legacy, accessPointId)
  }

  /** Lo que dejo el conector viejo: que dedos hay, sin plantilla ni equipo. */
  private async legacyOf(employeeId: number): Promise<{ fingers: number[]; face: boolean }> {
    const record = await EmployeeBiometric.query()
      .whereNull('employee_biometric_deleted_at')
      .where('employee_id', employeeId)
      .first()
    if (!record) return { fingers: [], face: false }
    return parseBiometricData(record.employeeBiometricData)
  }

  /**
   * El expediente completo, sin mirar equipos.
   *
   * Un dedo que este en las dos fuentes cuenta una sola vez: es el mismo dedo de
   * la misma persona, y contarlo dos veces convertiria "2 de 10" en "4 de 10"
   * para quien fue migrado del conector al canal.
   */
  private consolidated(
    slots: TemplateSlot[],
    legacy: { fingers: number[]; face: boolean }
  ): EmployeeBiometricSummary {
    const fingers = new Set<number>()
    let face = false
    for (const slot of slots) {
      if (slot.bioType === BIO_TYPE.FINGERPRINT) fingers.add(slot.bioNo)
      if (slot.bioType === BIO_TYPE.FACE) face = true
    }
    for (const finger of legacy.fingers) fingers.add(finger)
    face = face || legacy.face

    return {
      fingers: [...fingers]
        .sort((a, b) => a - b)
        .map((fingerId) => ({ fingerId, state: BIOMETRIC_SLOT_STATE.REGISTERED })),
      face: { registered: face, state: face ? BIOMETRIC_SLOT_STATE.REGISTERED : null },
      scopedToAccessPointId: null,
    }
  }

  /** El expediente contestado desde un equipo concreto. */
  private async scoped(
    slots: TemplateSlot[],
    legacy: { fingers: number[]; face: boolean },
    accessPointId: number
  ): Promise<EmployeeBiometricSummary> {
    const profile = await AccessPointProfile.query()
      .where('access_point_id', accessPointId)
      .first()
    const replicated = await this.replicatedTemplateIds(slots, accessPointId)

    const fingers = new Map<number, BiometricSlotState>()
    let face: BiometricSlotState | null = null

    for (const slot of slots) {
      const target =
        slot.bioType === BIO_TYPE.FINGERPRINT
          ? profile?.accessPointProfileFpVersion
          : profile?.accessPointProfileFaceVersion
      const state = resolveSlotState({
        present:
          slot.sourceAccessPointId === accessPointId || replicated.has(slot.templateId),
        templateMajorVer: slot.majorVer,
        deviceVersion: target ?? null,
      })

      if (slot.bioType === BIO_TYPE.FINGERPRINT) {
        fingers.set(slot.bioNo, betterState(fingers.get(slot.bioNo) ?? null, state))
      }
      if (slot.bioType === BIO_TYPE.FACE) {
        face = betterState(face, state)
      }
    }

    // El conector viejo no dice en que equipo dejo el dedo ni con que version,
    // asi que su palabra no alcanza para afirmar que este aqui.
    for (const finger of legacy.fingers) {
      if (!fingers.has(finger)) fingers.set(finger, BIOMETRIC_SLOT_STATE.UNKNOWN)
    }
    if (legacy.face && face === null) face = BIOMETRIC_SLOT_STATE.UNKNOWN

    return {
      fingers: [...fingers.entries()]
        .sort(([a], [b]) => a - b)
        .map(([fingerId, state]) => ({ fingerId, state })),
      face: { registered: face !== null, state: face },
      scopedToAccessPointId: accessPointId,
    }
  }

  /**
   * Templates que ya viajaron a ese equipo.
   *
   * La escritura al aparato se da por hecha cuando el comando queda ejecutado:
   * antes de eso el dato salio del servidor pero nadie ha confirmado que entrara.
   */
  private async replicatedTemplateIds(
    slots: TemplateSlot[],
    accessPointId: number
  ): Promise<Set<number>> {
    const templateIds = slots.map((slot) => slot.templateId)
    if (templateIds.length === 0) return new Set()

    const rows = await DeviceCommand.query()
      .where('access_point_id', accessPointId)
      .where('device_command_kind', DEVICE_COMMAND_KIND.BIODATA_WRITE)
      .where('device_command_status', DEVICE_COMMAND_STATUS.EXECUTED)
      .whereIn('biometric_template_id', templateIds)

    return new Set(
      rows
        .map((row) => row.biometricTemplateId)
        .filter((id): id is number => typeof id === 'number')
    )
  }

}
