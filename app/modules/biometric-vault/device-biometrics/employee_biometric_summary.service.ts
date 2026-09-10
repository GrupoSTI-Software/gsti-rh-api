import type { DateTime } from 'luxon'
import AccessPointEmployee, {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
} from '#models/access_point_employee'
import AccessPointProfile from '#models/access_point_profile'
import AdmsIncident from '#models/adms_incident'
import { ADMS_COPY_BLOCKING_KINDS } from '#modules/adms/adms.constants'
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
  /**
   * Dedos guardados que no sirven en NINGUN checador asignado al colaborador.
   *
   * No estan dentro de ninguno ni son compatibles con ninguno: son dato que se
   * conserva sin poder usarse. Es lo unico que se puede ofrecer borrar sin
   * dejar la base diciendo una cosa y un aparato otra.
   */
  orphanFingers: number[]
  /**
   * Incidente que esta reteniendo las copias hacia ese equipo.
   *
   * El canal no despacha templates ni fotos mientras una anomalia de IP siga
   * abierta: la misma serie se presento desde dos direcciones y hasta saber
   * cual es el aparato no se le manda un biometrico. Sin decirlo, el operador
   * ve un alta que no copio nada y ninguna explicacion.
   */
  withheldBy: { incidentId: number; kind: string; since: string | null } | null
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

    const orphanFingers = await this.orphansOf(slots, employeeId)

    if (accessPointId === undefined) {
      return { ...this.consolidated(slots, legacy), orphanFingers }
    }

    return { ...(await this.scoped(slots, legacy, accessPointId)), orphanFingers }
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
      orphanFingers: [],
      withheldBy: null,
    }
  }

  /**
   * Dedos que ya no tienen donde usarse.
   *
   * Se pregunta contra TODOS los checadores donde el colaborador esta dado de
   * alta: basta con que uno lo tenga dentro o pueda recibirlo para que el dato
   * siga sirviendo. Los que no pasan esa prueba son los unicos que tiene
   * sentido ofrecer borrar.
   */
  private async orphansOf(slots: TemplateSlot[], employeeId: number): Promise<number[]> {
    const fingerSlots = slots.filter((slot) => slot.bioType === BIO_TYPE.FINGERPRINT)
    if (fingerSlots.length === 0) return []

    const pivots = await AccessPointEmployee.query()
      .where('employee_id', employeeId)
      .whereNot('access_point_employee_sync_status', ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)
    const assigned = pivots.map((pivot) => pivot.accessPointId)

    const usable = new Set<number>()
    for (const accessPointId of assigned) {
      const scoped = await this.scoped(fingerSlots, { fingers: [], face: false }, accessPointId)
      for (const finger of scoped.fingers) {
        if (
          finger.state === BIOMETRIC_SLOT_STATE.HERE ||
          finger.state === BIOMETRIC_SLOT_STATE.COPYABLE
        ) {
          usable.add(finger.fingerId)
        }
      }
    }

    return [...new Set(fingerSlots.map((slot) => slot.bioNo))]
      .filter((fingerId) => !usable.has(fingerId))
      .sort((a, b) => a - b)
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
    const acknowledged = await this.replicatedTemplateIds(
      slots,
      accessPointId,
      DEVICE_COMMAND_STATUS.ACKED
    )

    const fingers = new Map<number, BiometricSlotState>()
    let face: BiometricSlotState | null = null

    for (const slot of slots) {
      const target =
        slot.bioType === BIO_TYPE.FINGERPRINT
          ? profile?.accessPointProfileFpVersion
          : profile?.accessPointProfileFaceVersion

      /**
       * El aparato declaro estar vacio despues de esto: no lo tiene.
       *
       * Se compara contra la fecha de cada prueba --la captura, la ejecucion o
       * el acuse-- y no de golpe: una copia POSTERIOR a esa lectura todavia
       * puede estar dentro, y darla por perdida mandaria a repetir un trabajo
       * que si se hizo.
       */
      const deniedFrom = this.counterDeniesFrom(profile ?? null, slot.bioType)
      const denies = (at: DateTime | null): boolean =>
        deniedFrom !== null && (at === null || at <= deniedFrom)

      const capturedHere = slot.sourceAccessPointId === accessPointId && !denies(slot.capturedAt)
      const copiedHere =
        replicated.has(slot.templateId) && !denies(replicated.get(slot.templateId) ?? null)
      const ackedHere =
        acknowledged.has(slot.templateId) && !denies(acknowledged.get(slot.templateId) ?? null)

      const state = resolveSlotState({
        present: capturedHere || copiedHere,
        acknowledged: ackedHere,
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
      orphanFingers: [],
      withheldBy: await this.withholdingIncident(accessPointId),
    }
  }

  /**
   * Anomalia abierta que retiene los biometricos de ese equipo.
   *
   * Se consulta aqui, junto al estado de los dedos, porque es parte de la misma
   * respuesta: de nada sirve decir que una huella se puede copiar si el canal
   * no la va a despachar.
   */
  private async withholdingIncident(
    accessPointId: number
  ): Promise<{ incidentId: number; kind: string; since: string | null } | null> {
    const incident = await AdmsIncident.query()
      .where('access_point_id', accessPointId)
      .whereIn('adms_incident_kind', [...ADMS_COPY_BLOCKING_KINDS])
      .where('adms_incident_status', 'open')
      .orderBy('adms_incident_id', 'desc')
      .first()

    if (!incident) return null
    return {
      incidentId: incident.admsIncidentId,
      kind: incident.admsIncidentKind,
      since: incident.admsIncidentCreatedAt?.toISO() ?? null,
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
    accessPointId: number,
    status: string = DEVICE_COMMAND_STATUS.EXECUTED
  ): Promise<Map<number, DateTime | null>> {
    const templateIds = slots.map((slot) => slot.templateId)
    if (templateIds.length === 0) return new Map()

    const rows = await DeviceCommand.query()
      .where('access_point_id', accessPointId)
      .where('device_command_kind', DEVICE_COMMAND_KIND.BIODATA_WRITE)
      .where('device_command_status', status)
      .whereIn('biometric_template_id', templateIds)

    const byTemplate = new Map<number, DateTime | null>()
    for (const row of rows) {
      if (typeof row.biometricTemplateId !== 'number') continue
      byTemplate.set(
        row.biometricTemplateId,
        row.deviceCommandExecutedAt ?? row.deviceCommandAckedAt ?? null
      )
    }
    return byTemplate
  }

  /**
   * Desde cuando el propio aparato desmiente lo que creemos haberle copiado.
   *
   * Un contador en cero dice que ahi dentro no hay una sola huella --o un solo
   * rostro-- por muchos acuses que guardemos de ese equipo. Un reset de
   * fabrica, un reemplazo o un cambio de version de algoritmo, que borra todo
   * lo que el aparato tenia, dejan los comandos viejos prometiendo un dato que
   * ya no existe.
   *
   * Paso el 2026-09-10: la ficha decia "Huella en camino" diecisiete horas
   * despues del acuse, hacia un equipo que se habia vaciado en medio. El
   * contador del propio aparato es la unica palabra que vale sobre su
   * contenido; un acuse solo prueba que la orden llego.
   *
   * `null` cuando no hay con que desmentir: sin lectura de `options`, o con el
   * contador en algo distinto de cero.
   */
  private counterDeniesFrom(profile: AccessPointProfile | null, bioType: number): DateTime | null {
    const readAt = profile?.accessPointProfileOptionsReadAt ?? null
    if (readAt === null) return null

    const count =
      bioType === BIO_TYPE.FINGERPRINT
        ? profile?.accessPointProfileFpCount
        : profile?.accessPointProfileFaceCount

    if (count === null || count === undefined || count > 0) return null
    return readAt
  }

}
