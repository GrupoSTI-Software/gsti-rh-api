import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { resolveMailSender } from '#helpers/resolve_mail_sender'
import EmployeeLactationPeriod from '#models/employee_lactation_period'
import SystemSetting from '#models/system_setting'
import SystemSettingNotificationEmail from '#models/system_setting_notification_email'
import { LACTATION_EXPIRING_THRESHOLD_DAYS } from '#constants/employee_lactation_compliance_status'
import {
  LACTATION_NOTIFICATION_TYPE,
  type LactationNotificationTypeValue,
} from '#constants/employee_lactation_notification'
import LactationExpiringMail, {
  type LactationExpiringMailRow,
} from '#mails/lactation_expiring_mail'
import mail from '@adonisjs/mail/services/main'
import { TenantContext } from '#utils/tenant_context'

/**
 * Logger inyectable. El comando ace pasa los métodos `info/warn/error` de
 * `BaseCommand.logger`; el controller pasa `console`. Tipos relajados
 * para no forzar al consumidor a importar el `ConsoleLogger` de Pino.
 */
export interface NotificationServiceLogger {
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
}

const NOOP_LOGGER: NotificationServiceLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

/**
 * Resumen agregado que el comando/endpoint devuelve al final de la
 * corrida. Espeja literalmente el contrato pedido por la HU
 * (sentCount, skippedAlreadyNotified, companiesWithoutRecipients).
 */
export interface RunExpiringCheckResult {
  /** Periodos para los que SÍ se registró un envío. */
  sentCount: number
  /**
   * Periodos elegibles que se omitieron porque ya existía un aviso
   * `expiring` previo en bitácora (idempotencia).
   */
  skippedAlreadyNotified: number
  /**
   * Empresas (system_setting_id) con periodos por vencer pero sin
   * destinatarios en `system_setting_notification_emails`. Sólo se
   * exponen identificadores para no filtrar nombres a logs externos.
   */
  companiesWithoutRecipients: number[]
  /**
   * Empresas para las que el envío del correo falló. Permiten al
   * endpoint manual indicarle a RH que reintente sin tener que parsear
   * los logs del servidor.
   */
  companiesWithMailErrors: number[]
  /** Empresas que recibieron al menos un correo en esta corrida. */
  companiesNotified: number
  /**
   * Total de periodos elegibles que entraron al pipeline antes de
   * filtrar por ya-notificados. Útil como métrica de "qué tan ocupada
   * está la corrida".
   */
  candidatesScanned: number
  /** Marca de tiempo de la corrida en zona CDMX (informativo). */
  ranAt: string
}

interface CandidateRow {
  employeeLactationPeriodId: number
  employeeId: number
  endDateIso: string
  daysLeft: number
  fullName: string
  employeeCode: string | null
  businessUnitSlug: string
  /** Marca de pertenencia del periodo (para el INSERT crudo de notificaciones). */
  businessUnitId: number
}

/**
 * Servicio del aviso automático "periodo de lactancia próximo a vencer".
 *
 * Diseño:
 *   - **Idempotencia**: cada combinación `(periodId, 'expiring')` se
 *     registra en `employee_lactation_period_notifications` con
 *     `UNIQUE` y se excluye en próximas corridas vía `NOT EXISTS`.
 *   - **Segmentación por empresa**: la empleada se asocia a su
 *     `business_unit_slug` y se resuelve el `SystemSetting` activo
 *     que la contenga; los destinatarios viven en
 *     `system_setting_notification_emails`.
 *   - **Resiliencia**: una falla de mail en una empresa no detiene
 *     las otras (se registra como warning y continúa).
 *   - **Confidencialidad**: el correo NO incluye notas internas del
 *     periodo ni claves de evidencia (HU explícita).
 */
export default class EmployeeLactationNotificationService {
  /**
   * Punto de entrada único. Se invoca desde:
   *   - El comando agendado `lactation:notify-expiring`.
   *   - El endpoint manual `POST .../notifications/run-expiring-check`.
   *
   * Diferencia entre los dos: ninguna. La HU lo pidió así para que el
   * endpoint sea fiel reproducción del cron y RH pueda verificar
   * exactamente lo que se enviaría.
   *
   * USRH1784259058510: corrida cross-empresa envuelta en `runUnscoped`
   * para que el camino HTTP (bajo `businessScope`) no quede acotado a
   * la unidad del actor; el cron ya corre sin contexto.
   */
  async runExpiringCheck(
    logger: NotificationServiceLogger = NOOP_LOGGER
  ): Promise<RunExpiringCheckResult> {
    return TenantContext.runUnscoped(
      () => this.executeExpiringCheck(logger),
      'aviso de vencimientos de lactancia (cross-empresa)'
    )
  }

  private async executeExpiringCheck(
    logger: NotificationServiceLogger
  ): Promise<RunExpiringCheckResult> {
    const today = DateTime.now().setZone('America/Mexico_City').startOf('day')
    const horizon = today.plus({ days: LACTATION_EXPIRING_THRESHOLD_DAYS })

    const candidates = await this.fetchCandidates(
      today.toISODate() as string,
      horizon.toISODate() as string
    )

    const result: RunExpiringCheckResult = {
      sentCount: 0,
      skippedAlreadyNotified: 0,
      companiesWithoutRecipients: [],
      companiesWithMailErrors: [],
      companiesNotified: 0,
      candidatesScanned: candidates.length,
      ranAt: today.toISO() ?? '',
    }

    if (candidates.length === 0) {
      logger.info('Sin periodos de lactancia por vencer en los próximos 30 días', {
        thresholdDays: LACTATION_EXPIRING_THRESHOLD_DAYS,
      })
      return result
    }

    // Carga única de SystemSettings activos para evitar N queries.
    const settings = await this.fetchActiveSystemSettings()
    const settingByBuSlug = this.indexSystemSettingsByBuSlug(settings)

    // Agrupa candidatos por SystemSetting. Si no se puede resolver, se
    // omite (no es un fallo crítico, lo registramos como warning con
    // sólo identificadores).
    const grouped = new Map<number, CandidateRow[]>()
    const unmatchedByBuSlug: Record<string, number[]> = {}
    for (const cand of candidates) {
      const setting = settingByBuSlug.get(cand.businessUnitSlug.toLowerCase())
      if (!setting) {
        const key = cand.businessUnitSlug.toLowerCase()
        ;(unmatchedByBuSlug[key] ??= []).push(cand.employeeLactationPeriodId)
        continue
      }
      const list = grouped.get(setting.systemSettingId) ?? []
      list.push(cand)
      grouped.set(setting.systemSettingId, list)
    }

    for (const [slug, ids] of Object.entries(unmatchedByBuSlug)) {
      logger.warn(
        `Unidad de negocio sin SystemSetting activo asociado; se omiten ${ids.length} periodo(s)`,
        { businessUnitSlug: slug, periodIds: ids }
      )
    }

    const from = resolveMailSender()

    for (const [systemSettingId, rows] of grouped.entries()) {
      const setting = settings.find((s) => s.systemSettingId === systemSettingId)!
      const recipients = await this.fetchRecipientsForSetting(systemSettingId)

      if (recipients.length === 0) {
        result.companiesWithoutRecipients.push(systemSettingId)
        logger.warn(
          'Empresa con periodos por vencer pero sin destinatarios configurados; se omite envío',
          {
            systemSettingId,
            periodIds: rows.map((r) => r.employeeLactationPeriodId),
          }
        )
        continue
      }

      // Antes de mandar: filtra los que YA fueron notificados (segunda
      // capa de defensa además del NOT EXISTS del query inicial, por si
      // dos corridas concurrentes empataran).
      const alreadyNotifiedIds = await this.findAlreadyNotifiedPeriodIds(
        rows.map((r) => r.employeeLactationPeriodId),
        LACTATION_NOTIFICATION_TYPE.EXPIRING
      )
      const toSend = rows.filter(
        (r) => !alreadyNotifiedIds.has(r.employeeLactationPeriodId)
      )
      result.skippedAlreadyNotified += rows.length - toSend.length

      if (toSend.length === 0) {
        continue
      }

      const mailRows: LactationExpiringMailRow[] = toSend.map((r) => ({
        employeeName: r.fullName,
        employeeCode: r.employeeCode,
        endDateIso: r.endDateIso,
        daysLeft: Math.max(0, r.daysLeft),
      }))

      try {
        await mail.send(
          new LactationExpiringMail({
            to: recipients[0],
            bcc: recipients.length > 1 ? recipients.slice(1) : undefined,
            from,
            // Por ahora todas las empresas en este sistema están en
            // México. Cuando se internacionalice, leer el idioma de
            // `SystemSetting`. Mantenemos español por contrato STPS.
            language: 'es',
            tradeName: setting.systemSettingTradeName,
            sidebarColor: this.formatSidebarColor(setting.systemSettingSidebarColor),
            rows: mailRows,
          })
        )

        // Persistimos UN registro por periodo (no por destinatario).
        // El UNIQUE garantiza que si hay race condition con otra
        // corrida concurrente, sólo prevalece el primer INSERT.
        const sentAt = DateTime.now().toJSDate()
        await db.table('employee_lactation_period_notifications').multiInsert(
          toSend.map((r) => ({
            employee_lactation_period_id: r.employeeLactationPeriodId,
            business_unit_id: r.businessUnitId,
            lactation_notification_type: LACTATION_NOTIFICATION_TYPE.EXPIRING,
            lactation_notification_sent_at: sentAt,
            employee_lactation_period_notification_created_at: sentAt,
          }))
        )

        result.sentCount += toSend.length
        result.companiesNotified += 1
        logger.info(
          `Correo de aviso enviado a ${recipients.length} destinatario(s) con ${toSend.length} periodo(s)`,
          {
            systemSettingId,
            recipientCount: recipients.length,
            periodIds: toSend.map((r) => r.employeeLactationPeriodId),
          }
        )
      } catch (e: unknown) {
        result.companiesWithMailErrors.push(systemSettingId)
        const message = e instanceof Error ? e.message : String(e)
        logger.error(`Error al enviar correo de aviso de lactancia: ${message}`, {
          systemSettingId,
          periodIds: toSend.map((r) => r.employeeLactationPeriodId),
        })
        // No re-lanzamos: continuamos con las demás empresas.
      }
    }

    return result
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  /**
   * Lista los periodos vivos con `end` en el rango `[today, horizon]` que
   * AÚN no tienen aviso `expiring`. Se carga `business_unit_slug` y los
   * campos del empleado necesarios para componer el correo en una sola
   * consulta (evita N+1).
   */
  private async fetchCandidates(
    todayIso: string,
    horizonIso: string
  ): Promise<CandidateRow[]> {
    const rows = await EmployeeLactationPeriod.query()
      .whereNull('employee_lactation_period_deleted_at')
      .where('employee_lactation_period_end_date', '>=', todayIso)
      .where('employee_lactation_period_end_date', '<=', horizonIso)
      .whereHas('employee', (q) => {
        q.whereNull('employee_deleted_at')
      })
      .whereNotExists((sub) => {
        sub
          .from('employee_lactation_period_notifications as eln')
          .select(db.raw('1'))
          .whereRaw(
            'eln.employee_lactation_period_id = employee_lactation_periods.employee_lactation_period_id'
          )
          .where(
            'eln.lactation_notification_type',
            LACTATION_NOTIFICATION_TYPE.EXPIRING
          )
          .whereNull('eln.employee_lactation_period_notification_deleted_at')
      })
      .preload('employee', (q) => {
        q.preload('person').preload('businessUnit')
      })

    const today = DateTime.fromISO(todayIso, { zone: 'America/Mexico_City' })
    const candidates: CandidateRow[] = []
    for (const period of rows) {
      const employee = period.employee
      if (!employee || !employee.businessUnit) continue

      const endIso = this.toIsoDate(period.employeeLactationPeriodEndDate)
      if (!endIso) continue
      const endDt = DateTime.fromISO(endIso, { zone: 'America/Mexico_City' })
      const daysLeft = Math.max(0, Math.round(endDt.diff(today, 'days').days))

      const person = employee.person ?? null
      const first = person?.personFirstname ?? employee.employeeFirstName ?? ''
      const last = person?.personLastname ?? employee.employeeLastName ?? ''
      const second = person?.personSecondLastname ?? employee.employeeSecondLastName ?? ''
      const fullName =
        [first, last, second].map((s) => (s ?? '').trim()).filter(Boolean).join(' ') || '—'

      candidates.push({
        employeeLactationPeriodId: period.employeeLactationPeriodId,
        employeeId: period.employeeId,
        endDateIso: endIso,
        daysLeft,
        fullName,
        employeeCode: employee.employeeCode ? String(employee.employeeCode) : null,
        businessUnitSlug: employee.businessUnit.businessUnitSlug ?? '',
        businessUnitId: period.businessUnitId,
      })
    }
    return candidates
  }

  private async fetchActiveSystemSettings(): Promise<SystemSetting[]> {
    return SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_active', 1)
      .select(
        'system_setting_id',
        'system_setting_trade_name',
        'system_setting_sidebar_color',
        'system_setting_business_units',
        'system_setting_active'
      )
  }

  /**
   * Construye `Map<businessUnitSlug, SystemSetting>` para resolución
   * O(1) durante el agrupado. El CSV `systemSettingBusinessUnits` se
   * normaliza a lowercase + trim antes de indexar.
   */
  private indexSystemSettingsByBuSlug(
    settings: SystemSetting[]
  ): Map<string, SystemSetting> {
    const map = new Map<string, SystemSetting>()
    for (const setting of settings) {
      const slugs = (setting.systemSettingBusinessUnits ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
      for (const slug of slugs) {
        if (!map.has(slug)) {
          map.set(slug, setting)
        }
      }
    }
    return map
  }

  private async fetchRecipientsForSetting(systemSettingId: number): Promise<string[]> {
    const rows = await SystemSettingNotificationEmail.query()
      .whereNull('system_setting_notification_email_deleted_at')
      .where('system_setting_id', systemSettingId)
      .orderBy('system_setting_notification_email_id', 'asc')
    const seen = new Set<string>()
    const out: string[] = []
    for (const row of rows) {
      const raw = (row.email ?? '').trim()
      if (!raw) continue
      const key = raw.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(raw)
    }
    return out
  }

  private async findAlreadyNotifiedPeriodIds(
    periodIds: number[],
    type: LactationNotificationTypeValue
  ): Promise<Set<number>> {
    if (periodIds.length === 0) return new Set()
    const rows = await db
      .from('employee_lactation_period_notifications')
      .whereIn('employee_lactation_period_id', periodIds)
      .where('lactation_notification_type', type)
      .whereNull('employee_lactation_period_notification_deleted_at')
      .select('employee_lactation_period_id as periodId')
    return new Set(rows.map((r: { periodId: number }) => Number(r.periodId)))
  }

  /** Normaliza un valor `@column.date()` a `YYYY-MM-DD` sin pérdida por TZ. */
  private toIsoDate(value: unknown): string | null {
    if (value === null || value === undefined) return null
    if (DateTime.isDateTime(value)) {
      return (value as DateTime).toUTC().toISODate() ?? null
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return null
      const parsed = DateTime.fromISO(trimmed, { zone: 'utc' })
      return parsed.isValid ? parsed.toISODate() : trimmed.slice(0, 10)
    }
    return null
  }

  private formatSidebarColor(color: string | null | undefined): string {
    const c = (color ?? '').trim() || '3D5DC0'
    return c.startsWith('#') ? c : `#${c}`
  }
}
