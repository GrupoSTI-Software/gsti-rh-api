import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import mail from '@adonisjs/mail/services/main'
import RepseRegistration from '#models/repse_registration'
import SystemSetting from '#models/system_setting'
import SystemSettingNotificationEmail from '#models/system_setting_notification_email'
import {
  buildRenovacionPeriodoClave,
  getActiveInformativaWindow,
  INFORMATIVA_THRESHOLD_DAYS,
  RENEWAL_THRESHOLD_DAYS,
  REPSE_FOLIO_AVISO_TIPO,
  type RepseFolioAvisoTipoValue,
} from '#constants/repse_folio_aviso'
import RepseFolioExpiringMail, {
  type RepseFolioExpiringMailRow,
} from '#mails/repse_folio_expiring_mail'
import { REPSE_FOLIO_RUN_UNSCOPED_REASON } from '#constants/repse_folio_aviso'
import { TenantContext } from '#utils/tenant_context'

/**
 * Lista de desarrollo — solo estos correos reciben avisos reales en
 * desarrollo. Espejo de `notice_service.ts` / `telework_policy_notification`.
 */
const DEVELOPMENT_EMAIL_LIST = ['jsoto@siler-mx.com', 'wramirez@siler-mx.com', 'wilvardo@gmail.com']

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

/** Resumen agregado idéntico al contrato de lactancia. */
export interface RunExpiringCheckResult {
  sentCount: number
  skippedAlreadyNotified: number
  companiesWithoutRecipients: number[]
  companiesWithMailErrors: number[]
  companiesNotified: number
  candidatesScanned: number
  ranAt: string
}

interface CandidateRow {
  repseRegistrationId: number
  folio: string
  tipo: RepseFolioAvisoTipoValue
  periodoClave: string
  dueDateIso: string
  daysLeft: number
  businessUnitSlug: string
}

/**
 * Servicio de avisos automáticos de vigencia del folio REPSE.
 *
 * Proceso GLOBAL segmentado por empresa vía `TenantContext.runUnscoped`. Idempotencia
 * vía bitácora `repse_folio_avisos` + UNIQUE + NOT EXISTS.
 */
export default class RepseFolioAvisoService {
  async runExpiringCheck(
    logger: NotificationServiceLogger = NOOP_LOGGER
  ): Promise<RunExpiringCheckResult> {
    return TenantContext.runUnscoped(
      () => this.executeExpiringCheck(logger),
      REPSE_FOLIO_RUN_UNSCOPED_REASON
    )
  }

  private async executeExpiringCheck(
    logger: NotificationServiceLogger
  ): Promise<RunExpiringCheckResult> {
    const today = DateTime.now().setZone('America/Mexico_City').startOf('day')
    const todayIso = today.toISODate() as string
    const horizonIso = today.plus({ days: RENEWAL_THRESHOLD_DAYS }).toISODate() as string

    const renovacionCandidates = await this.fetchRenovacionCandidates(todayIso, horizonIso)
    const informativaCandidates = await this.fetchInformativaCandidates(today)
    const candidates = [...renovacionCandidates, ...informativaCandidates]

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
      logger.info('Sin avisos de vigencia REPSE pendientes en la corrida', {
        renewalThresholdDays: RENEWAL_THRESHOLD_DAYS,
        informativaThresholdDays: INFORMATIVA_THRESHOLD_DAYS,
      })
      return result
    }

    const settings = await this.fetchActiveSystemSettings()
    const settingByBuSlug = this.indexSystemSettingsByBuSlug(settings)

    const grouped = new Map<number, CandidateRow[]>()
    const unmatchedByBuSlug: Record<string, number[]> = {}

    for (const cand of candidates) {
      const setting = settingByBuSlug.get(cand.businessUnitSlug.toLowerCase())
      if (!setting) {
        const key = cand.businessUnitSlug.toLowerCase()
        ;(unmatchedByBuSlug[key] ??= []).push(cand.repseRegistrationId)
        continue
      }
      const list = grouped.get(setting.systemSettingId) ?? []
      list.push(cand)
      grouped.set(setting.systemSettingId, list)
    }

    for (const [slug, ids] of Object.entries(unmatchedByBuSlug)) {
      logger.warn(
        `Unidad de negocio sin SystemSetting activo asociado; se omiten ${ids.length} registro(s) REPSE`,
        { businessUnitSlug: slug, registrationIds: ids }
      )
    }

    const from = env.get('SMTP_FROM_ADDRESS', env.get('SMTP_USERNAME', 'no-reply@valanserh.local'))
    const isDevelopment = env.get('NODE_ENV') !== 'production'

    for (const [systemSettingId, rows] of grouped.entries()) {
      const setting = settings.find((s) => s.systemSettingId === systemSettingId)!
      const recipients = await this.fetchRecipientsForSetting(systemSettingId)

      if (recipients.length === 0) {
        result.companiesWithoutRecipients.push(systemSettingId)
        logger.warn(
          'Empresa con avisos REPSE pendientes pero sin destinatarios configurados; se omite envío',
          {
            systemSettingId,
            registrationIds: rows.map((r) => r.repseRegistrationId),
          }
        )
        continue
      }

      const alreadyNotifiedKeys = await this.findAlreadyNotifiedKeys(rows)
      const toSend = rows.filter(
        (r) => !alreadyNotifiedKeys.has(this.candidateKey(r))
      )
      result.skippedAlreadyNotified += rows.length - toSend.length

      if (toSend.length === 0) {
        continue
      }

      const mailRows: RepseFolioExpiringMailRow[] = toSend.map((r) => ({
        folio: r.folio,
        tipo: r.tipo,
        dueDateIso: r.dueDateIso,
        daysLeft: Math.max(0, r.daysLeft),
      }))

      try {
        const simulateSend = this.shouldSimulateSendInDevelopment(recipients, isDevelopment)

        if (!simulateSend) {
          await mail.send(
            new RepseFolioExpiringMail({
              to: recipients[0],
              bcc: recipients.length > 1 ? recipients.slice(1) : undefined,
              from,
              language: 'es',
              tradeName: setting.systemSettingTradeName,
              sidebarColor: this.formatSidebarColor(setting.systemSettingSidebarColor),
              rows: mailRows,
            })
          )
        }

        const sentAt = DateTime.now().toJSDate()
        await db.table('repse_folio_avisos').multiInsert(
          toSend.map((r) => ({
            repse_registration_id: r.repseRegistrationId,
            repse_folio_aviso_tipo: r.tipo,
            repse_folio_aviso_periodo_clave: r.periodoClave,
            repse_folio_aviso_enviado_en: sentAt,
            repse_folio_aviso_created_at: sentAt,
          }))
        )

        result.sentCount += toSend.length
        result.companiesNotified += 1
        logger.info(
          simulateSend
            ? `Aviso REPSE simulado (dev) para ${toSend.length} evento(s)`
            : `Correo de aviso REPSE enviado a ${recipients.length} destinatario(s) con ${toSend.length} evento(s)`,
          {
            systemSettingId,
            recipientCount: recipients.length,
            registrationIds: toSend.map((r) => r.repseRegistrationId),
            simulated: simulateSend,
          }
        )
      } catch (e: unknown) {
        result.companiesWithMailErrors.push(systemSettingId)
        const message = e instanceof Error ? e.message : String(e)
        logger.error(`Error al enviar correo de aviso REPSE: ${message}`, {
          systemSettingId,
          registrationIds: toSend.map((r) => r.repseRegistrationId),
        })
      }
    }

    return result
  }

  private async fetchRenovacionCandidates(
    todayIso: string,
    horizonIso: string
  ): Promise<CandidateRow[]> {
    const rows = await RepseRegistration.query()
      .whereNull('repse_registration_deleted_at')
      .where('repse_registration_status', 'active')
      .where('repse_registration_expires_at', '>=', todayIso)
      .where('repse_registration_expires_at', '<=', horizonIso)
      .whereNotExists((sub) => {
        sub
          .from('repse_folio_avisos as rfa')
          .select(db.raw('1'))
          .whereRaw(
            'rfa.repse_registration_id = repse_registrations.repse_registration_id'
          )
          .where('rfa.repse_folio_aviso_tipo', REPSE_FOLIO_AVISO_TIPO.RENOVACION)
          .whereRaw(
            "rfa.repse_folio_aviso_periodo_clave = CONCAT(YEAR(repse_registrations.repse_registration_expires_at), '-RENOV')"
          )
          .whereNull('rfa.repse_folio_aviso_deleted_at')
      })
      .preload('businessUnit')

    const today = DateTime.fromISO(todayIso, { zone: 'America/Mexico_City' })
    const candidates: CandidateRow[] = []

    for (const registration of rows) {
      const bu = registration.businessUnit
      if (!bu?.businessUnitSlug) continue

      const expiresIso = this.toIsoDate(registration.expiresAt)
      if (!expiresIso) continue

      const expiresDt = DateTime.fromISO(expiresIso, { zone: 'America/Mexico_City' })
      const daysLeft = Math.max(0, Math.round(expiresDt.diff(today, 'days').days))
      const periodoClave = buildRenovacionPeriodoClave(expiresDt.year)

      candidates.push({
        repseRegistrationId: registration.repseRegistrationId,
        folio: registration.folio,
        tipo: REPSE_FOLIO_AVISO_TIPO.RENOVACION,
        periodoClave,
        dueDateIso: expiresIso,
        daysLeft,
        businessUnitSlug: bu.businessUnitSlug,
      })
    }

    return candidates
  }

  private async fetchInformativaCandidates(today: DateTime): Promise<CandidateRow[]> {
    const window = getActiveInformativaWindow(today)
    if (!window) {
      return []
    }

    const presentationIso = window.presentationDate.toISODate() as string
    const todayStart = today.startOf('day')
    const daysLeft = Math.max(
      0,
      Math.round(window.presentationDate.diff(todayStart, 'days').days)
    )

    const rows = await RepseRegistration.query()
      .whereNull('repse_registration_deleted_at')
      .where('repse_registration_status', 'active')
      .whereNotExists((sub) => {
        sub
          .from('repse_folio_avisos as rfa')
          .select(db.raw('1'))
          .whereRaw(
            'rfa.repse_registration_id = repse_registrations.repse_registration_id'
          )
          .where('rfa.repse_folio_aviso_tipo', REPSE_FOLIO_AVISO_TIPO.INFORMATIVA)
          .where('rfa.repse_folio_aviso_periodo_clave', window.periodoClave)
          .whereNull('rfa.repse_folio_aviso_deleted_at')
      })
      .preload('businessUnit')

    const candidates: CandidateRow[] = []

    for (const registration of rows) {
      const bu = registration.businessUnit
      if (!bu?.businessUnitSlug) continue

      candidates.push({
        repseRegistrationId: registration.repseRegistrationId,
        folio: registration.folio,
        tipo: REPSE_FOLIO_AVISO_TIPO.INFORMATIVA,
        periodoClave: window.periodoClave,
        dueDateIso: presentationIso,
        daysLeft,
        businessUnitSlug: bu.businessUnitSlug,
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

  private candidateKey(row: Pick<CandidateRow, 'repseRegistrationId' | 'tipo' | 'periodoClave'>) {
    return `${row.repseRegistrationId}:${row.tipo}:${row.periodoClave}`
  }

  private async findAlreadyNotifiedKeys(rows: CandidateRow[]): Promise<Set<string>> {
    if (rows.length === 0) return new Set()

    const registrationIds = [...new Set(rows.map((r) => r.repseRegistrationId))]
    const dbRows = await db
      .from('repse_folio_avisos')
      .whereIn('repse_registration_id', registrationIds)
      .whereNull('repse_folio_aviso_deleted_at')
      .select(
        'repse_registration_id as registrationId',
        'repse_folio_aviso_tipo as tipo',
        'repse_folio_aviso_periodo_clave as periodoClave'
      )

    const keys = new Set<string>()
    for (const row of dbRows) {
      keys.add(
        `${Number(row.registrationId)}:${String(row.tipo)}:${String(row.periodoClave)}`
      )
    }
    return keys
  }

  private shouldSimulateSendInDevelopment(
    recipients: string[],
    isDevelopment: boolean
  ): boolean {
    if (!isDevelopment) return false
    return recipients.every(
      (email) =>
        !DEVELOPMENT_EMAIL_LIST.some((devEmail) => devEmail.toLowerCase() === email.toLowerCase())
    )
  }

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
