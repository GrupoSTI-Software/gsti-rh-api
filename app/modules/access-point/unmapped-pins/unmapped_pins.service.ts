import { DateTime } from 'luxon'
import { requireEmployeeBusinessUnitId } from '#modules/access-point/employee_business_unit'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import AccessPointEmployee from '#models/access_point_employee'
import AdmsHeldBiometric from '#models/adms_held_biometric'
import AdmsHeldPunch from '#models/adms_held_punch'
import AdmsUnmappedPin from '#models/adms_unmapped_pin'
import Employee from '#models/employee'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { AdmsError } from '#exceptions/adms_error'
import { ASSIST_ORIGIN } from '#constants/assist_origin'
import AssistIngestionService from '#modules/assist-ingestion/assist_ingestion.service'
import TemplateService from '#modules/biometric-vault/template/template.service'
import type { AccessPointScopePort } from '#modules/access-point/sharing/access_point_scope.port'
import AccessPointScopeRepositoryMysql from '#modules/access-point/sharing/access_point_scope.repository.mysql'
import { TenantContext } from '#utils/tenant_context'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'

export interface UnmappedPinRow {
  unmappedPinId: number
  accessPointId: number
  pin: string
  /**
   * Nombre que el equipo declara para ese PIN, si lo mando en su bitacora.
   * Es PII y sale enmascarado como el resto; se revela por el flujo de PII.
   */
  name: string | null
  /** Modalidades vistas: `fingerprint`, `face`, `palm`. */
  biometricsSeen: string[]
  status: string
  punchCount: number
  heldPunches: number
  heldBiometrics: number
  firstSeenAt: string
  lastSeenAt: string
}

/** Del numero que usa el aparato al nombre que entiende una persona. */
const BIO_TYPE_LABEL: Record<string, string> = {
  '1': 'fingerprint',
  '8': 'palm',
  '9': 'face',
}

export interface CandidateRow {
  employeeId: number
  employeeCode: string | null
  fullName: string
  /** Por que se propone: el codigo coincide con el PIN, o el nombre se parece. */
  matchedBy: 'code' | 'name'
}

export interface LinkResult {
  unmappedPinId: number
  employeeId: number
  attributedPunches: number
  movedBiometrics: number
}

/**
 * PINs que el checador reporta y que no corresponden a nadie (spec ADMS 9.4).
 *
 * Pasa siempre al arrancar: alguien dio de alta gente en el aparato antes de
 * que el sistema existiera. Lo que marcaron esas personas NO se tira -- es
 * tiempo trabajado que alguien tiene que pagar -- se retiene aparte y se
 * acredita cuando un humano dice de quien es.
 */
export default class UnmappedPinsService {
  constructor(
    private readonly assists: AssistIngestionService = new AssistIngestionService(),
    private readonly templates: TemplateService = new TemplateService(),
    private readonly scope: AccessPointScopePort = new AccessPointScopeRepositoryMysql()
  ) {}

  async list(businessUnitIds: number[], status?: string): Promise<UnmappedPinRow[]> {
    if (businessUnitIds.length === 0) return []

    const sharedIds = await this.sharedAccessPointIds(businessUnitIds)
    /**
     * Las filas viven con la empresa del aparato: la invitada las ve por el
     * `access_point_id` compartido, no por su `business_unit_id`, asi que la
     * consulta (y los conteos de lo retenido, que tambien son de la
     * responsable) corre sin el filtro del mixin con la visibilidad explicita.
     */
    return TenantContext.runUnscoped(
      () => this.listRows(businessUnitIds, sharedIds, status),
      TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING
    )
  }

  private async listRows(
    businessUnitIds: number[],
    sharedIds: number[],
    status?: string
  ): Promise<UnmappedPinRow[]> {
    const rows = await AdmsUnmappedPin.query()
      .where((visible) => visibleTo(visible, businessUnitIds, sharedIds))
      .if(status !== undefined, (query) =>
        query.where('adms_unmapped_pin_status', status as string)
      )
      .orderBy('adms_unmapped_pin_last_seen_at', 'desc')
      .limit(300)
      .exec()

    const result: UnmappedPinRow[] = []
    for (const row of rows) {
      const punches = await AdmsHeldPunch.query()
        .where('adms_unmapped_pin_id', row.admsUnmappedPinId)
        .where('adms_held_punch_status', 'held')
        .count('* as total')
      const biometrics = await AdmsHeldBiometric.query()
        .where('adms_unmapped_pin_id', row.admsUnmappedPinId)
        .count('* as total')

      result.push({
        unmappedPinId: row.admsUnmappedPinId,
        accessPointId: row.accessPointId,
        pin: row.admsUnmappedPinPin,
        name: row.admsUnmappedPinName ?? null,
        biometricsSeen: (row.admsUnmappedPinBioTypesSeen ?? []).map(
          (tipo) => BIO_TYPE_LABEL[tipo] ?? `desconocido:${tipo}`
        ),
        status: row.admsUnmappedPinStatus,
        punchCount: row.admsUnmappedPinPunchCount,
        heldPunches: Number(punches[0].$extras.total ?? 0),
        heldBiometrics: Number(biometrics[0].$extras.total ?? 0),
        firstSeenAt: row.admsUnmappedPinFirstSeenAt.toISO() ?? '',
        lastSeenAt: row.admsUnmappedPinLastSeenAt.toISO() ?? '',
      })
    }
    return result
  }

  /**
   * Colaboradores que podrian ser el dueño del PIN.
   *
   * Son SUGERENCIAS y nada mas: quien vincula es una persona. Acreditar
   * automaticamente por parecido de nombre le colgaria las checadas de alguien
   * a otro, y eso se paga en la nomina de los dos.
   */
  async candidates(
    unmappedPinId: number,
    businessUnitIds: number[],
    search?: string
  ): Promise<CandidateRow[]> {
    const row = await this.requireRow(unmappedPinId, businessUnitIds)

    /**
     * Se busca en el alcance de quien pregunta (no en la empresa de la fila) y
     * solo entre quienes participan del aparato: un empleado de la invitada se
     * propone para el PIN del checador de la responsable.
     */
    const participants = await this.scope.participants(row.accessPointId, row.businessUnitId)
    const reachable = businessUnitIds.filter((id) => participants.includes(id))

    const byCode = await Employee.query()
      .whereIn('business_unit_id', reachable)
      .where('employee_code', row.admsUnmappedPinPin)
      .whereNull('employee_deleted_at')
      .limit(5)

    const byName =
      search && search.trim().length >= 3
        ? await Employee.query()
            .whereIn('business_unit_id', reachable)
            .whereNull('employee_deleted_at')
            .where((group) => {
              group
                .whereILike('employee_first_name', `%${search.trim()}%`)
                .orWhereILike('employee_last_name', `%${search.trim()}%`)
            })
            .limit(20)
        : []

    const seen = new Set<number>()
    const candidates: CandidateRow[] = []
    for (const employee of byCode) {
      seen.add(employee.employeeId)
      candidates.push(toCandidate(employee, 'code'))
    }
    for (const employee of byName) {
      if (seen.has(employee.employeeId)) continue
      seen.add(employee.employeeId)
      candidates.push(toCandidate(employee, 'name'))
    }
    return candidates
  }

  /**
   * Le pone dueño al PIN y acredita lo retenido.
   *
   * El pivote queda `confirmed` con `pin_source = device`: el numero ya existe
   * en el aparato, no hay nada que mandarle. Marcarlo como pendiente de envio
   * generaria un alta que sobrescribiria lo que ya funciona.
   */
  async link(input: {
    unmappedPinId: number
    employeeId: number
    businessUnitIds: number[]
    userId: number | null
    now?: DateTime
  }): Promise<LinkResult> {
    const now = input.now ?? DateTime.utc()
    const row = await this.requirePendingRow(input.unmappedPinId, input.businessUnitIds)

    const employee = await Employee.query()
      .where('employee_id', input.employeeId)
      .whereIn('business_unit_id', input.businessUnitIds)
      .whereNull('employee_deleted_at')
      .first()
    if (
      !employee ||
      !(await this.scope.isParticipant(row.accessPointId, requireEmployeeBusinessUnitId(employee)))
    ) {
      throw new AdmsError(
        'El colaborador no existe en tu alcance o no participa de este equipo',
        ADMS_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
        404,
        'colaborador-no-encontrado',
        'No se encontro el colaborador.'
      )
    }

    /**
     * Desde aqui todo corre con el scope del aparato completo: la validacion
     * del PIN debe ver tambien a los empleados de las demas participantes, y
     * lo retenido es de la responsable.
     */
    const deviceScope = await this.scope.participants(row.accessPointId, row.businessUnitId)
    return TenantContext.run(deviceScope, () => this.claim(row, employee, input.userId, now))
  }

  /** El reclamo en si, ya dentro del scope del aparato. */
  private async claim(
    row: AdmsUnmappedPin,
    employee: Employee,
    userId: number | null,
    now: DateTime
  ): Promise<LinkResult> {
    /** El PIN no puede quedarse con dos dueños en el mismo equipo. */
    const taken = await AccessPointEmployee.query()
      .where('access_point_id', row.accessPointId)
      .where('access_point_employee_pin', row.admsUnmappedPinPin)
      .whereNot('employee_id', employee.employeeId)
      .first()
    if (taken) {
      throw new AdmsError(
        'Ese numero ya es de otro colaborador en este equipo',
        ADMS_ERROR_CODES.PIN_TAKEN,
        409,
        'pin-ocupado',
        'Revoca primero al colaborador que tiene ese numero.'
      )
    }

    const pivot =
      (await AccessPointEmployee.query()
        .where('access_point_id', row.accessPointId)
        .where('employee_id', employee.employeeId)
        .first()) ?? new AccessPointEmployee()

    pivot.accessPointId = row.accessPointId
    /** El pivote es de la empresa del empleado, no de la responsable del aparato. */
    pivot.businessUnitId = requireEmployeeBusinessUnitId(employee)
    pivot.employeeId = employee.employeeId
    pivot.accessPointEmployeePin = row.admsUnmappedPinPin
    pivot.accessPointEmployeePinSource = 'device'
    pivot.accessPointEmployeeSyncStatus = 'confirmed'
    pivot.accessPointEmployeeSyncConfirmedAt = now
    await pivot.save()

    const attributedPunches = await this.attributeHeldPunches(row, employee, now)
    const movedBiometrics = await this.moveHeldBiometrics(row, employee, now)

    row.admsUnmappedPinStatus = 'linked'
    /** A quien se vinculo queda en la fila: sin esto habia que deducirlo por el pivote. */
    row.linkedEmployeeId = employee.employeeId
    /** El nombre que dijo el aparato deja de hacer falta y no se conserva. */
    row.admsUnmappedPinName = null
    row.admsUnmappedPinResolvedByUserId = userId
    row.admsUnmappedPinResolvedAt = now
    await row.save()

    return {
      unmappedPinId: row.admsUnmappedPinId,
      employeeId: employee.employeeId,
      attributedPunches,
      movedBiometrics,
    }
  }

  /**
   * Descarta el PIN. Si vuelve a aparecer, el canal lo reabre: descartar no es
   * una lista negra, es decir "hoy no se de quien es".
   */
  async dismiss(input: {
    unmappedPinId: number
    reason: string
    businessUnitIds: number[]
    userId: number | null
    now?: DateTime
  }): Promise<AdmsUnmappedPin> {
    const row = await this.requirePendingRow(input.unmappedPinId, input.businessUnitIds)
    /**
     * Descartar es decidir sobre el numero del aparato, y la fila es de la
     * responsable (VLRH-P0065, 3.3). La invitada puede reclamarlo con su
     * personal, no descartarlo: para ella se comporta como inexistente.
     */
    if (!input.businessUnitIds.includes(row.businessUnitId as number)) throw pendingNotFound()
    row.admsUnmappedPinStatus = 'dismissed'
    row.admsUnmappedPinDismissReason = input.reason.slice(0, 200)
    row.admsUnmappedPinName = null
    row.admsUnmappedPinResolvedByUserId = input.userId
    row.admsUnmappedPinResolvedAt = input.now ?? DateTime.utc()
    /** La fila es de la responsable: una invitada la resuelve con el scope del aparato. */
    const deviceScope = await this.scope.participants(row.accessPointId, row.businessUnitId)
    await TenantContext.run(deviceScope, () => row.save())
    return row
  }

  /**
   * Manda al motor las checadas retenidas, con el recalculo diferido: acreditar
   * meses de marcajes de golpe dentro de una peticion la tumbaria.
   */
  private async attributeHeldPunches(
    row: AdmsUnmappedPin,
    employee: Employee,
    now: DateTime
  ): Promise<number> {
    const held = await AdmsHeldPunch.query()
      .where('adms_unmapped_pin_id', row.admsUnmappedPinId)
      .where('adms_held_punch_status', 'held')
      .orderBy('adms_held_punch_id', 'asc')

    if (held.length === 0) return 0

    const accessPoint = await db
      .from('access_points')
      .where('access_point_id', row.accessPointId)
      .first()

    const { results } = await this.assists.ingest(
      held.map((punch) => ({
        subject: { kind: 'employeeId' as const, employeeId: employee.employeeId },
        assistType: null,
        punchTimeUtc: punch.admsHeldPunchPunchTimeUtc,
        geo: { latitude: null, longitude: null, precision: null },
        origin: ASSIST_ORIGIN.ADMS,
        createdByUserId: null,
        terminalSn: accessPoint?.access_point_serial_number ?? null,
        terminalAlias: accessPoint?.access_point_name ?? null,
        verifyMethod: punch.admsHeldPunchVerify,
        clientRef: null,
      })),
      { deferCalendarRecalc: true }
    )

    /**
     * Solo cuenta lo que el motor acepto, y cada checada retenida queda
     * enlazada a la checada que la acredito. Una rechazada (colaborador dado
     * de baja en medio, duplicada) se queda retenida: marcarla acreditada
     * sin checada detras era decir que se pago algo que no existe.
     */
    let attributed = 0
    for (const [index, punch] of held.entries()) {
      const result = results[index]
      if (!result || result.outcome === 'rejected' || result.assist === null) {
        logger.warn(
          { heldPunchId: punch.admsHeldPunchId, error: result?.error ?? null },
          'PIN sin dueno: una checada retenida no se pudo acreditar y sigue retenida'
        )
        continue
      }
      punch.admsHeldPunchStatus = 'attributed'
      punch.admsHeldPunchAttributedAt = now
      punch.assistId = result.assist.assistId
      await punch.save()
      attributed += 1
    }
    return attributed
  }

  /** Y los biometricos retenidos pasan a la boveda, ya con dueño. */
  private async moveHeldBiometrics(
    row: AdmsUnmappedPin,
    employee: Employee,
    now: DateTime
  ): Promise<number> {
    const held = await AdmsHeldBiometric.query().where(
      'adms_unmapped_pin_id',
      row.admsUnmappedPinId
    )
    let moved = 0
    for (const biometric of held) {
      const template = biometric.admsHeldBiometricTemplate
      if (template === null) {
        /** Un blob que no descifra no va a servir nunca: se descarta en vez de quedar retenido para siempre. */
        biometric.admsHeldBiometricStatus = 'discarded'
        await biometric.save()
        continue
      }
      const result = await this.templates.store({
        employeeId: employee.employeeId,
        businessUnitId: requireEmployeeBusinessUnitId(employee),
        bioType: biometric.admsHeldBiometricBioType,
        bioNo: biometric.admsHeldBiometricBioNo,
        bioIndex: 0,
        bioFormat: 0,
        majorVer: biometric.admsHeldBiometricMajorVer,
        minorVer: biometric.admsHeldBiometricMinorVer,
        valid: 1,
        duress: 0,
        template,
        sourceAccessPointId: row.accessPointId,
        capturedAt: now,
      })
      if (result.ok) {
        moved += 1
        await biometric.delete()
      }
    }
    return moved
  }

  /**
   * Vincular y descartar solo aplican a un PIN todavia pendiente: volver a
   * vincular uno ya resuelto le colgaria un segundo pivote a otra persona.
   */
  private async requirePendingRow(
    unmappedPinId: number,
    businessUnitIds: number[]
  ): Promise<AdmsUnmappedPin> {
    const row = await this.requireRow(unmappedPinId, businessUnitIds)
    if (row.admsUnmappedPinStatus === 'pending') return row
    throw new AdmsError(
      'Ese numero pendiente ya se resolvio',
      ADMS_ERROR_CODES.PIN_PENDING_RESOLVED,
      409,
      'pin-pendiente-resuelto',
      'Ese numero ya fue vinculado o descartado; no se puede resolver dos veces.'
    )
  }

  private async requireRow(
    unmappedPinId: number,
    businessUnitIds: number[]
  ): Promise<AdmsUnmappedPin> {
    const sharedIds =
      businessUnitIds.length === 0 ? [] : await this.sharedAccessPointIds(businessUnitIds)
    const row =
      businessUnitIds.length === 0
        ? null
        : await TenantContext.runUnscoped(
            () =>
              AdmsUnmappedPin.query()
                .where('adms_unmapped_pin_id', unmappedPinId)
                .where((visible) => visibleTo(visible, businessUnitIds, sharedIds))
                .first(),
            TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING
          )
    if (row) return row
    throw pendingNotFound()
  }

  /** Aparatos que las empresas dadas usan como invitadas. */
  private async sharedAccessPointIds(businessUnitIds: number[]): Promise<number[]> {
    const lists = await Promise.all(businessUnitIds.map((id) => this.scope.sharedWith(id)))
    return [...new Set(lists.flat())]
  }
}

function pendingNotFound(): AdmsError {
  return new AdmsError(
    'No se encontro ese numero pendiente',
    ADMS_ERROR_CODES.PIN_PENDING_NOT_FOUND,
    404,
    'pin-pendiente-no-encontrado',
    'El numero pendiente no existe o no esta en tu alcance.'
  )
}

function toCandidate(employee: Employee, matchedBy: 'code' | 'name'): CandidateRow {
  return {
    employeeId: employee.employeeId,
    employeeCode:
      employee.employeeCode !== null && employee.employeeCode !== undefined
        ? String(employee.employeeCode)
        : null,
    fullName: [employee.employeeFirstName, employee.employeeLastName]
      .filter((part) => typeof part === 'string' && part.length > 0)
      .join(' '),
    matchedBy,
  }
}

/** Las filas de las empresas dadas y las de los aparatos que comparten con ellas. */
function visibleTo(
  query: {
    whereIn: (column: string, values: number[]) => unknown
    orWhereIn: (column: string, values: number[]) => unknown
  },
  businessUnitIds: number[],
  sharedIds: number[]
): void {
  query.whereIn('business_unit_id', businessUnitIds)
  if (sharedIds.length > 0) query.orWhereIn('access_point_id', sharedIds)
}
