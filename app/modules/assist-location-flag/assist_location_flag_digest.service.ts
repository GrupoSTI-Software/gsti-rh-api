import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import mail from '@adonisjs/mail/services/main'
import adonisLogger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { resolveMailSender } from '#helpers/resolve_mail_sender'
import { DEVELOPMENT_EMAIL_LIST } from '#constants/employee_celebration_email'
import {
  ASSIST_LOCATION_FLAG_DIGEST_SUBJECT,
  ASSIST_LOCATION_FLAG_DIGEST_VIEW,
  ASSIST_LOCATION_FLAG_NOTIFY_ACTION,
  ASSIST_LOCATION_FLAG_NOTIFY_MAX_AGE_DAYS,
  ASSIST_LOCATION_FLAG_NOTIFY_MAX_PER_RUN,
  ASSIST_LOCATION_FLAG_NOTIFY_MODULE,
} from '#constants/assist_location_flag_digest'
import PermissionRecipientResolverService from '#services/permission_recipient_resolver_service'
import SiteTimeZoneService from '#modules/attendance-time/site_time_zone.service'
import AssistLocationFlagDigestRepositoryMysql from './assist_location_flag_digest.repository.mysql.js'
import type {
  AssistLocationFlagDigestRepository,
  AssistLocationFlagPendingRow,
} from './assist_location_flag_digest.repository.js'
import type {
  AssistLocationFlagDigestCompanyOutcome,
  AssistLocationFlagDigestLine,
  AssistLocationFlagDigestMailData,
  AssistLocationFlagDigestResult,
} from './dto/assist_location_flag_digest.dto.js'

/** Envío de un correo ya armado. Lanza si no salió. */
export type AssistLocationFlagDigestMailer = (input: {
  businessUnitId: number
  recipients: readonly string[]
  data: AssistLocationFlagDigestMailData
}) => Promise<void>

/** Lo único que el servicio escribe en bitácora: ids de empresa, conteos y clases de error. */
export interface AssistLocationFlagDigestLogger {
  info(meta: Record<string, unknown>, message: string): void
  warn(meta: Record<string, unknown>, message: string): void
  error(meta: Record<string, unknown>, message: string): void
}

export interface AssistLocationFlagDigestDependencies {
  repository: AssistLocationFlagDigestRepository
  recipients: Pick<PermissionRecipientResolverService, 'resolveEmails'>
  siteTimeZones: Pick<SiteTimeZoneService, 'forEmployees'>
  mailer: AssistLocationFlagDigestMailer
  logger: AssistLocationFlagDigestLogger
  isProduction: () => boolean
  now: () => DateTime
}

interface EmployeeRow {
  employee_id: number
  employee_code: string | null
  employee_first_name: string | null
  employee_last_name: string | null
  employee_second_last_name: string | null
  person_id: number | null
}

interface SettingRow {
  system_setting_trade_name: string | null
  system_setting_sidebar_color: string | null
}

const DEFAULT_SIDEBAR_COLOR = '#333333'

/** Envío real: el remitente institucional en `to` y todos los destinatarios en copia oculta. */
const sendWithAdonisMail: AssistLocationFlagDigestMailer = async ({ recipients, data }) => {
  const sender = resolveMailSender()
  await mail.send((message) => {
    message
      .from(sender)
      .to(sender)
      .bcc([...recipients])
      .subject(ASSIST_LOCATION_FLAG_DIGEST_SUBJECT)
      .htmlView(ASSIST_LOCATION_FLAG_DIGEST_VIEW, data)
  })
}

/** Nombre de la clase del error, nunca su mensaje: una respuesta SMTP puede traer direcciones. */
function errorClass(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error
}

function isDevelopmentRecipient(email: string): boolean {
  return DEVELOPMENT_EMAIL_LIST.some((devEmail) => devEmail.toLowerCase() === email.toLowerCase())
}

function employeeFullName(row: EmployeeRow): string {
  return [row.employee_first_name, row.employee_last_name, row.employee_second_last_name]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' ')
}

function sidebarColor(value: string | null): string {
  const color = value?.trim()
  if (!color) return DEFAULT_SIDEBAR_COLOR
  return color.startsWith('#') ? color : `#${color}`
}

/**
 * Correo agrupado a RH con las checadas que el teléfono reportó con ubicación
 * simulada (VLRH-H1791056340278).
 *
 * Empresa por empresa, y cada una aislada en su propio `try`: resuelve los
 * destinatarios ANTES de reclamar (una empresa sin destinatarios no toca
 * nada), reclama de forma atómica sus pendientes, arma un solo correo por
 * empleado y día del sitio y lo envía en copia oculta. Si el armado o el envío
 * fallan, libera lo reclamado para que salga en la corrida siguiente.
 *
 * Límite aceptado: si el proceso muere entre el reclamo y el envío, esas
 * checadas quedan avisadas sin correo (ventana de segundos).
 */
export default class AssistLocationFlagDigestService {
  private readonly deps: AssistLocationFlagDigestDependencies

  constructor(deps: Partial<AssistLocationFlagDigestDependencies> = {}) {
    this.deps = {
      repository: deps.repository ?? new AssistLocationFlagDigestRepositoryMysql(),
      recipients: deps.recipients ?? new PermissionRecipientResolverService(),
      siteTimeZones: deps.siteTimeZones ?? new SiteTimeZoneService(),
      mailer: deps.mailer ?? sendWithAdonisMail,
      logger: deps.logger ?? adonisLogger,
      isProduction: deps.isProduction ?? (() => env.get('NODE_ENV') === 'production'),
      now: deps.now ?? (() => DateTime.utc()),
    }
  }

  async run(): Promise<AssistLocationFlagDigestResult> {
    const since = this.deps.now().minus({ days: ASSIST_LOCATION_FLAG_NOTIFY_MAX_AGE_DAYS })
    const result: AssistLocationFlagDigestResult = {
      companiesNotified: 0,
      companiesWithoutRecipients: 0,
      companiesSimulated: 0,
      companiesFailed: 0,
      assistsNotified: 0,
    }

    for (const businessUnitId of await this.deps.repository.findBusinessUnitsWithPending(since)) {
      const outcome = await this.notifyBusinessUnit(businessUnitId, since)
      switch (outcome.kind) {
        case 'sent':
          result.companiesNotified += 1
          result.assistsNotified += outcome.assists
          break
        case 'without-recipients':
          result.companiesWithoutRecipients += 1
          break
        case 'simulated':
          result.companiesSimulated += 1
          break
        case 'failed':
          result.companiesFailed += 1
          break
        case 'nothing-claimed':
          break
      }
    }

    return result
  }

  private async notifyBusinessUnit(
    businessUnitId: number,
    since: DateTime
  ): Promise<AssistLocationFlagDigestCompanyOutcome> {
    const { repository, logger } = this.deps
    try {
      const recipients = await this.deps.recipients.resolveEmails({
        businessUnitId,
        module: ASSIST_LOCATION_FLAG_NOTIFY_MODULE,
        action: ASSIST_LOCATION_FLAG_NOTIFY_ACTION,
      })
      if (recipients.length === 0) {
        logger.warn({ businessUnitId }, 'aviso de ubicación simulada sin destinatarios')
        return { kind: 'without-recipients' }
      }

      // Fuera de producción solo salen correos a la lista de desarrollo.
      const deliverable = this.deps.isProduction()
        ? recipients
        : recipients.filter(isDevelopmentRecipient)

      const claimedAt = this.deps.now().startOf('second')
      const claimed = await repository.claimPending(
        businessUnitId,
        since,
        ASSIST_LOCATION_FLAG_NOTIFY_MAX_PER_RUN,
        claimedAt
      )
      if (claimed.length === 0) return { kind: 'nothing-claimed' }

      if (deliverable.length === 0) {
        logger.info(
          { businessUnitId, simulated: claimed.length },
          'aviso de ubicación simulada: envío simulado fuera de producción'
        )
        return { kind: 'simulated', assists: claimed.length }
      }

      return await this.deliver(businessUnitId, claimed, claimedAt, deliverable)
    } catch (error) {
      logger.error(
        { businessUnitId, error: errorClass(error) },
        'aviso de ubicación simulada falló'
      )
      return { kind: 'failed' }
    }
  }

  /** Arma y envía; cualquier falla libera lo reclamado y se propaga. */
  private async deliver(
    businessUnitId: number,
    claimed: AssistLocationFlagPendingRow[],
    claimedAt: DateTime,
    deliverable: readonly string[]
  ): Promise<AssistLocationFlagDigestCompanyOutcome> {
    const { repository, logger } = this.deps
    let pending = claimed
    try {
      const employees = await this.findEmployees(
        businessUnitId,
        [...new Set(claimed.map((row) => row.employeeId))]
      )

      // Una checada cuyo empleado no se resuelve en la empresa no se manda.
      const unresolved = claimed.filter((row) => !employees.has(row.employeeId))
      if (unresolved.length > 0) {
        await repository.releaseClaim(
          businessUnitId,
          unresolved.map((row) => row.assistId),
          claimedAt
        )
        pending = claimed.filter((row) => employees.has(row.employeeId))
      }
      if (pending.length === 0) return { kind: 'nothing-claimed' }

      // El empleado nunca ve la marca de sus propias checadas (R6 de VLRH-C0014).
      const ownEmails = await this.findOwnEmails(
        pending.map((row) => employees.get(row.employeeId)!.person_id)
      )
      const recipients = deliverable.filter((email) => !ownEmails.has(email))
      if (recipients.length === 0) {
        await this.releaseAll(businessUnitId, pending, claimedAt)
        logger.warn(
          { businessUnitId },
          'aviso de ubicación simulada sin destinatarios ajenos a las checadas'
        )
        return { kind: 'without-recipients' }
      }

      const data = await this.buildMailData(businessUnitId, pending, employees)
      await this.deps.mailer({ businessUnitId, recipients, data })

      logger.info(
        { businessUnitId, assists: pending.length, recipients: recipients.length },
        'aviso de ubicación simulada enviado'
      )
      return { kind: 'sent', assists: pending.length }
    } catch (error) {
      await this.releaseAll(businessUnitId, pending, claimedAt)
      throw error
    }
  }

  private releaseAll(
    businessUnitId: number,
    rows: AssistLocationFlagPendingRow[],
    claimedAt: DateTime
  ): Promise<void> {
    return this.deps.repository.releaseClaim(
      businessUnitId,
      rows.map((row) => row.assistId),
      claimedAt
    )
  }

  private async findEmployees(
    businessUnitId: number,
    employeeIds: number[]
  ): Promise<Map<number, EmployeeRow>> {
    const rows = (await db
      .from('employees')
      .where('business_unit_id', businessUnitId)
      .whereIn('employee_id', employeeIds)
      .select(
        'employee_id',
        'employee_code',
        'employee_first_name',
        'employee_last_name',
        'employee_second_last_name',
        'person_id'
      )) as EmployeeRow[]
    return new Map(rows.map((row) => [Number(row.employee_id), row]))
  }

  /**
   * Correos de las cuentas de los empleados del lote: misma relación cuenta ↔
   * empleado que `sessionUserEmployeeOwnership` (`users.person_id`).
   */
  private async findOwnEmails(personIds: Array<number | null>): Promise<Set<string>> {
    const ids = [...new Set(personIds.filter((id): id is number => id !== null))]
    if (ids.length === 0) return new Set()

    const rows = (await db
      .from('users')
      .whereIn('person_id', ids)
      .whereNull('user_deleted_at')
      .select('user_email')) as Array<{ user_email: string | null }>
    return new Set(
      rows
        .map((row) => row.user_email?.trim().toLowerCase() ?? '')
        .filter((email) => email !== '')
    )
  }

  private async buildMailData(
    businessUnitId: number,
    rows: AssistLocationFlagPendingRow[],
    employees: Map<number, EmployeeRow>
  ): Promise<AssistLocationFlagDigestMailData> {
    const zones = await this.deps.siteTimeZones.forEmployees([
      ...new Set(rows.map((row) => row.employeeId)),
    ])

    // Un renglón por (empleado, día del sitio): el día se calcula en la zona
    // del sitio del empleado, nunca en UTC (R7 de VLRH-C0014).
    const groups = new Map<string, { employee: EmployeeRow; day: DateTime; times: DateTime[] }>()
    for (const row of rows) {
      const employee = employees.get(row.employeeId)!
      const zone = zones.get(row.employeeId)?.zone ?? 'utc'
      const local = row.punchTimeUtc.setZone(zone).setLocale('es')
      const key = `${row.employeeId}|${local.toISODate()}`
      const group = groups.get(key) ?? { employee, day: local.startOf('day'), times: [] }
      group.times.push(local)
      groups.set(key, group)
    }

    const lines: Array<AssistLocationFlagDigestLine & { sortDay: string }> = [...groups.values()].map(
      (group) => {
        const times = group.times.sort((a, b) => a.toMillis() - b.toMillis())
        return {
          employeeName: employeeFullName(group.employee),
          employeeCode: group.employee.employee_code ?? '',
          dayLabel: group.day.toFormat("cccc d 'de' LLLL yyyy"),
          times: times.map((time) => time.toFormat('HH:mm')),
          count: times.length,
          sortDay: group.day.toISODate() ?? '',
        }
      }
    )
    lines.sort(
      (a, b) =>
        a.employeeName.localeCompare(b.employeeName, 'es') ||
        a.sortDay.localeCompare(b.sortDay) ||
        a.times[0].localeCompare(b.times[0])
    )

    const setting = (await db
      .from('system_settings')
      .where('business_unit_id', businessUnitId)
      .whereNull('system_setting_deleted_at')
      .orderBy('system_setting_id', 'asc')
      .select('system_setting_trade_name', 'system_setting_sidebar_color')
      .first()) as SettingRow | null

    return {
      tradeName: setting?.system_setting_trade_name?.trim() ?? '',
      sidebarColor: sidebarColor(setting?.system_setting_sidebar_color ?? null),
      lines: lines.map(({ sortDay: _sortDay, ...line }) => line),
    }
  }
}
