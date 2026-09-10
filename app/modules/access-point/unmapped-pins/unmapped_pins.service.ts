import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
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
    private readonly templates: TemplateService = new TemplateService()
  ) {}

  async list(businessUnitIds: number[], status?: string): Promise<UnmappedPinRow[]> {
    if (businessUnitIds.length === 0) return []

    const rows = await AdmsUnmappedPin.query()
      .whereIn('business_unit_id', businessUnitIds)
      .if(status !== undefined, (query) => query.where('adms_unmapped_pin_status', status as string))
      .orderBy('adms_unmapped_pin_last_seen_at', 'desc')
      .limit(300)

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

    const byCode = await Employee.query()
      .where('business_unit_id', row.businessUnitId)
      .where('employee_code', row.admsUnmappedPinPin)
      .whereNull('employee_deleted_at')
      .limit(5)

    const byName =
      search && search.trim().length >= 3
        ? await Employee.query()
            .where('business_unit_id', row.businessUnitId)
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
    const row = await this.requireRow(input.unmappedPinId, input.businessUnitIds)

    const employee = await Employee.query()
      .where('employee_id', input.employeeId)
      .where('business_unit_id', row.businessUnitId)
      .whereNull('employee_deleted_at')
      .first()
    if (!employee) {
      throw new AdmsError(
        'El colaborador no existe en esa empresa',
        ADMS_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
        404,
        'colaborador-no-encontrado',
        'No se encontro el colaborador.'
      )
    }

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
    pivot.businessUnitId = row.businessUnitId
    pivot.employeeId = employee.employeeId
    pivot.accessPointEmployeePin = row.admsUnmappedPinPin
    pivot.accessPointEmployeePinSource = 'device'
    pivot.accessPointEmployeeSyncStatus = 'confirmed'
    pivot.accessPointEmployeeSyncConfirmedAt = now
    await pivot.save()

    const attributedPunches = await this.attributeHeldPunches(row, employee, now)
    const movedBiometrics = await this.moveHeldBiometrics(row, employee, now)

    row.admsUnmappedPinStatus = 'linked'
    /** El nombre que dijo el aparato deja de hacer falta y no se conserva. */
    row.admsUnmappedPinName = null
    row.admsUnmappedPinResolvedByUserId = input.userId
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
    const row = await this.requireRow(input.unmappedPinId, input.businessUnitIds)
    row.admsUnmappedPinStatus = 'dismissed'
    row.admsUnmappedPinDismissReason = input.reason.slice(0, 200)
    row.admsUnmappedPinName = null
    row.admsUnmappedPinResolvedByUserId = input.userId
    row.admsUnmappedPinResolvedAt = input.now ?? DateTime.utc()
    await row.save()
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

    await this.assists.ingest(
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

    for (const punch of held) {
      punch.admsHeldPunchStatus = 'attributed'
      punch.admsHeldPunchAttributedAt = now
      await punch.save()
    }
    return held.length
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
      if (template === null) continue
      const result = await this.templates.store({
        employeeId: employee.employeeId,
        businessUnitId: row.businessUnitId,
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

  private async requireRow(
    unmappedPinId: number,
    businessUnitIds: number[]
  ): Promise<AdmsUnmappedPin> {
    const row =
      businessUnitIds.length === 0
        ? null
        : await AdmsUnmappedPin.query()
            .where('adms_unmapped_pin_id', unmappedPinId)
            .whereIn('business_unit_id', businessUnitIds)
            .first()
    if (row) return row
    throw new AdmsError(
      'No se encontro ese numero pendiente',
      ADMS_ERROR_CODES.PIN_PENDING_NOT_FOUND,
      404,
      'pin-pendiente-no-encontrado',
      'El numero pendiente no existe o no esta en tu alcance.'
    )
  }
}

function toCandidate(employee: Employee, matchedBy: 'code' | 'name'): CandidateRow {
  return {
    employeeId: employee.employeeId,
    employeeCode: employee.employeeCode !== null && employee.employeeCode !== undefined
      ? String(employee.employeeCode)
      : null,
    fullName: [employee.employeeFirstName, employee.employeeLastName]
      .filter((part) => typeof part === 'string' && part.length > 0)
      .join(' '),
    matchedBy,
  }
}
