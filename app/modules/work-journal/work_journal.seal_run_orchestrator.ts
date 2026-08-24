import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import mail from '@adonisjs/mail/services/main'
import { resolveMailSender } from '#helpers/resolve_mail_sender'
import BusinessUnit from '#models/business_unit'
import SystemSetting from '#models/system_setting'
import SystemSettingPayrollConfig from '#models/system_setting_payroll_config'
import WorkJournalSealRun, { type WorkJournalSealRunSummary } from '#models/work_journal_seal_run'
import WorkJournalSealRunItem, {
  type WorkJournalSealRunItemResult,
} from '#models/work_journal_seal_run_item'
import { TenantContext } from '#utils/tenant_context'
import { getBusinessTimeZone, todayInBusinessZone, toCalendarIsoDate } from '#utils/business_date'
import WorkJournalService from './work_journal.service.js'
import WorkJournalSealRunSummaryMail from '#mails/work_journal_seal_run_summary_mail'
import SystemSettingNotificationEmail from '#models/system_setting_notification_email'
import {
  resolveExpiredPayrollPeriod,
  type ExpiredPayrollPeriod,
  type PayrollPaymentType,
  type PayrollPeriodConfig,
} from './work_journal.period_calculator.js'

/**
 * Orquestador batch del job de cierre automático de jornada
 * (USRH1782268640950). Recorre todas las empresas, resuelve su
 * `payroll_config` vigente, detecta periodos vencidos con el calculador
 * (-02) y los sella con el servicio de la pieza base (-01).
 *
 * Diseño (regla de negocio #6 y #9):
 *  - Un error al sellar una empresa se registra en `work_journal_seal_run_items`
 *    y NO detiene el procesamiento de las demás.
 *  - El reintento de lo fallido no depende de que el calculador vuelva a
 *    marcar el mismo día como vencido (solo lo hace una vez): se basa en
 *    releer los items `error` sin un item posterior `sealed`/`skipped` para
 *    el mismo (empresa, periodo).
 *  - Cada empresa se procesa en su propio ámbito; se usa `runUnscoped`
 *    porque es un proceso batch sin usuario HTTP.
 */
export default class WorkJournalSealRunOrchestrator {
  /**
   * Ejecuta una corrida completa.
   * @param cutoffDateIso Fecha de corte a evaluar (`YYYY-MM-DD`). Por
   *   default, "ayer" en zona de negocio (uso normal, diario).
   * @param options.businessUnitId Acota la corrida a una sola empresa
   *   (`--business-unit-id`, para depuración manual).
   */
  async run(
    cutoffDateIso?: string,
    options: { businessUnitId?: number } = {}
  ): Promise<WorkJournalSealRun> {
    const zone = getBusinessTimeZone()
    const cutoff = cutoffDateIso ?? (todayInBusinessZone().minus({ days: 1 }).toISODate() as string)

    const run = await WorkJournalSealRun.create({
      cutoffDate: DateTime.fromISO(cutoff, { zone }),
      startedAt: DateTime.now(),
      status: 'running',
      summary: null,
    })

    const summary: WorkJournalSealRunSummary = {
      cutoffDate: cutoff,
      businessUnitsProcessed: 0,
      businessUnitsWithoutConfig: 0,
      businessUnitsWithoutConfigNames: [],
      periodsSealed: 0,
      periodsSkipped: 0,
      periodsWithErrors: 0,
      errors: [],
    }

    try {
      await TenantContext.runUnscoped(
        () =>
          this.processAllBusinessUnits(
            run.workJournalSealRunId,
            cutoff,
            summary,
            options.businessUnitId
          ),
        'job cierre de jornada'
      )
      run.status = this.computeStatus(summary)
    } catch (error) {
      run.status = 'failed'
      logger.error(
        { err: error },
        'work-journal:seal-period — error inesperado en la corrida (fuera del loop por empresa)'
      )
    } finally {
      run.finishedAt = DateTime.now()
      run.summary = summary
      await run.save()
    }

    await this.notify(run, summary)
    return run
  }

  private async processAllBusinessUnits(
    runId: number,
    cutoff: string,
    summary: WorkJournalSealRunSummary,
    onlyBusinessUnitId?: number
  ): Promise<void> {
    const businessUnits = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('business_unit_active', 1)
      .if(onlyBusinessUnitId, (q) => q.where('business_unit_id', onlyBusinessUnitId as number))

    if (businessUnits.length === 0) {
      return
    }

    const settingByBuSlug = await this.fetchSettingsByBuSlug()
    const pendingRetries = await this.fetchPendingRetries(businessUnits.map((bu) => bu.businessUnitId))

    for (const businessUnit of businessUnits) {
      await this.processBusinessUnit(runId, businessUnit, cutoff, settingByBuSlug, pendingRetries, summary)
    }
  }

  private async processBusinessUnit(
    runId: number,
    businessUnit: BusinessUnit,
    cutoff: string,
    settingByBuSlug: Map<string, SystemSetting>,
    pendingRetries: Map<number, ExpiredPayrollPeriod[]>,
    summary: WorkJournalSealRunSummary
  ): Promise<void> {
    const setting = settingByBuSlug.get((businessUnit.businessUnitSlug ?? '').toLowerCase())
    if (!setting) {
      summary.businessUnitsWithoutConfig += 1
      summary.businessUnitsWithoutConfigNames.push(businessUnit.businessUnitName)
      return
    }

    const payrollConfig = await this.resolveEffectivePayrollConfig(setting.systemSettingId, cutoff)
    if (!payrollConfig) {
      summary.businessUnitsWithoutConfig += 1
      summary.businessUnitsWithoutConfigNames.push(businessUnit.businessUnitName)
      return
    }

    summary.businessUnitsProcessed += 1

    const candidates: ExpiredPayrollPeriod[] = []
    const newPeriod = resolveExpiredPayrollPeriod(this.toCalculatorConfig(payrollConfig), cutoff)
    if (newPeriod) {
      candidates.push(newPeriod)
    }
    for (const retry of pendingRetries.get(businessUnit.businessUnitId) ?? []) {
      candidates.push(retry)
    }

    for (const period of this.dedupePeriods(candidates)) {
      await this.sealAndRecordItem(runId, businessUnit, period, summary)
    }
  }

  /** Sella un periodo de una empresa e imputa el resultado al resumen + item. */
  private async sealAndRecordItem(
    runId: number,
    businessUnit: BusinessUnit,
    period: ExpiredPayrollPeriod,
    summary: WorkJournalSealRunSummary
  ): Promise<void> {
    let result: WorkJournalSealRunItemResult
    let detail: string | null = null

    try {
      const service = new WorkJournalService()
      const sealResult = await service.seal(businessUnit.businessUnitId, {
        from: period.from,
        to: period.to,
      })

      // 'periodo-sin-datos' es una omisión legítima (empleado sin jornada
      // materializable en el rango, p. ej. de alta después del periodo), no
      // una falla técnica: no cuenta como error ni dispara reintento.
      const realFailures = sealResult.failed.filter((f) => f.reason !== 'periodo-sin-datos')
      const omittedWithoutData = sealResult.failed.length - realFailures.length

      if (realFailures.length > 0) {
        result = 'error'
        detail = realFailures
          .map((f) => `empleado ${f.employeeId}${f.date ? ` (${f.date})` : ''}: ${f.reason}`)
          .join('; ')
        if (omittedWithoutData > 0) {
          detail += ` (+${omittedWithoutData} empleado(s) sin jornada materializable, omitidos sin error)`
        }
        summary.periodsWithErrors += 1
        summary.errors.push({
          businessUnitName: businessUnit.businessUnitName,
          periodStart: period.from,
          periodEnd: period.to,
          detail,
        })
      } else if (sealResult.sealed > 0) {
        result = 'sealed'
        summary.periodsSealed += 1
      } else {
        // sealed=0, skipped=0, failed=[] (p. ej. empresa sin empleados en el
        // periodo) cae aquí igual que "ya estaba cerrado": no hay error, no
        // hay nada más que hacer con este periodo.
        result = 'skipped'
        summary.periodsSkipped += 1
      }
    } catch (error) {
      result = 'error'
      detail = error instanceof Error ? error.message : 'error-no-clasificado'
      summary.periodsWithErrors += 1
      summary.errors.push({
        businessUnitName: businessUnit.businessUnitName,
        periodStart: period.from,
        periodEnd: period.to,
        detail,
      })
      logger.error(
        { err: error, businessUnitId: businessUnit.businessUnitId, period },
        'work-journal:seal-period — error al sellar el periodo de una empresa'
      )
    }

    await WorkJournalSealRunItem.create({
      workJournalSealRunId: runId,
      businessUnitId: businessUnit.businessUnitId,
      periodStart: DateTime.fromISO(period.from),
      periodEnd: DateTime.fromISO(period.to),
      result,
      detail,
    })
  }

  /**
   * Periodos con `result = 'error'` que aún no tienen un item posterior
   * `sealed`/`skipped` para el mismo (empresa, periodo) — regla de
   * negocio #6 (reintento en la siguiente corrida).
   */
  private async fetchPendingRetries(
    businessUnitIds: number[]
  ): Promise<Map<number, ExpiredPayrollPeriod[]>> {
    const pending = new Map<number, ExpiredPayrollPeriod[]>()
    if (businessUnitIds.length === 0) {
      return pending
    }

    const [errorItems, resolvedItems] = await Promise.all([
      WorkJournalSealRunItem.query()
        .whereIn('business_unit_id', businessUnitIds)
        .where('work_journal_seal_run_item_result', 'error')
        .orderBy('work_journal_seal_run_item_id', 'asc'),
      WorkJournalSealRunItem.query()
        .whereIn('business_unit_id', businessUnitIds)
        .whereIn('work_journal_seal_run_item_result', ['sealed', 'skipped']),
    ])

    const resolvedKeys = new Set(resolvedItems.map((item) => this.periodKey(item)))
    const seenErrorKeys = new Set<string>()

    for (const item of errorItems) {
      const key = this.periodKey(item)
      if (resolvedKeys.has(key) || seenErrorKeys.has(key)) {
        continue
      }
      seenErrorKeys.add(key)

      const from = item.periodStart.toISODate()
      const to = item.periodEnd.toISODate()
      if (!from || !to) {
        continue
      }
      const list = pending.get(item.businessUnitId) ?? []
      list.push({ from, to })
      pending.set(item.businessUnitId, list)
    }

    return pending
  }

  private periodKey(item: WorkJournalSealRunItem): string {
    return `${item.businessUnitId}:${item.periodStart.toISODate()}:${item.periodEnd.toISODate()}`
  }

  private dedupePeriods(periods: ExpiredPayrollPeriod[]): ExpiredPayrollPeriod[] {
    const seen = new Set<string>()
    const out: ExpiredPayrollPeriod[] = []
    for (const period of periods) {
      const key = `${period.from}:${period.to}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      out.push(period)
    }
    return out
  }

  /**
   * `SystemSetting` no tiene FK directa a `business_unit`: la relación real
   * es `systemSettingBusinessUnits` (CSV de slugs) contra
   * `businessUnit.businessUnitSlug` (mismo patrón que
   * `EmployeeLactationNotificationService.indexSystemSettingsByBuSlug`).
   */
  private async fetchSettingsByBuSlug(): Promise<Map<string, SystemSetting>> {
    const settings = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_active', 1)
      .select('system_setting_id', 'system_setting_trade_name', 'system_setting_business_units', 'system_setting_active')

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

  /**
   * Config vigente para la fecha de corte (casos borde §11 anexo: cambios
   * de `payroll_config` a media marcha): la de mayor `apply_since` que sea
   * `<= cutoff`.
   */
  private async resolveEffectivePayrollConfig(
    systemSettingId: number,
    cutoffIso: string
  ): Promise<SystemSettingPayrollConfig | null> {
    const configs = await SystemSettingPayrollConfig.query()
      .whereNull('system_setting_payroll_config_deleted_at')
      .where('system_setting_id', systemSettingId)
      .orderBy('system_setting_payroll_config_apply_since', 'desc')

    for (const config of configs) {
      const applySince = toCalendarIsoDate(config.systemSettingPayrollConfigApplySince)
      if (applySince && applySince <= cutoffIso) {
        return config
      }
    }
    return null
  }

  private toCalculatorConfig(config: SystemSettingPayrollConfig): PayrollPeriodConfig {
    return {
      paymentType: config.systemSettingPayrollConfigPaymentType as PayrollPaymentType,
      fixedDay: config.systemSettingPayrollConfigFixedDay ?? null,
      fixedEveryNWeeks: config.systemSettingPayrollConfigFixedEveryNWeeks ?? null,
      applySince: toCalendarIsoDate(config.systemSettingPayrollConfigApplySince) ?? '',
    }
  }

  private computeStatus(summary: WorkJournalSealRunSummary): 'ok' | 'partial' | 'failed' {
    const totalPeriods = summary.periodsSealed + summary.periodsSkipped + summary.periodsWithErrors
    if (summary.periodsWithErrors === 0) {
      return 'ok'
    }
    return summary.periodsWithErrors === totalPeriods ? 'failed' : 'partial'
  }

  /**
   * Notifica por correo (decisión 2026-07-07: mismo canal que
   * `notify_attendance_fault_hr` / `lactation_notify_expiring`). Solo
   * envía si hay algo que reportar (sellados, errores u omitidas por
   * config faltante); una corrida vacía ("nadie venció hoy") no genera
   * correo, para no saturar la bandeja — el registro persistido en
   * `work_journal_seal_runs` ya cubre la auditoría de esos días.
   */
  /**
   * Resuelve destinatarios desde `system_setting_notification_emails`
   * (mismo patrón que `EmployeeLactationNotificationService`). Se agregan
   * todos los correos activos de todos los system_settings para que el
   * equipo de operaciones de cualquier empresa reciba el resumen global.
   * Si la tabla está vacía, no se envía correo (misma lógica que lactancia).
   */
  private async fetchNotificationRecipients(): Promise<string[]> {
    const rows = await SystemSettingNotificationEmail.query()
      .whereNull('system_setting_notification_email_deleted_at')
      .orderBy('system_setting_notification_email_id', 'asc')

    const seen = new Set<string>()
    const out: string[] = []
    for (const row of rows) {
      const email = row.email.trim().toLowerCase()
      if (email && !seen.has(email)) {
        seen.add(email)
        out.push(row.email.trim())
      }
    }
    return out
  }

  private async notify(run: WorkJournalSealRun, summary: WorkJournalSealRunSummary): Promise<void> {
    const recipients = await this.fetchNotificationRecipients()

    if (recipients.length === 0) {
      logger.info(
        'work-journal:seal-period — sin destinatarios en system_setting_notification_emails; se omite el correo de resumen'
      )
      return
    }

    const hasSomethingToReport =
      summary.periodsSealed + summary.periodsWithErrors + summary.businessUnitsWithoutConfig > 0
    if (!hasSomethingToReport) {
      return
    }

    const from = resolveMailSender()

    // Toma el nombre de marca y color del primer system_setting activo que
    // tenga al menos una empresa mapeada, para darle identidad visual al correo.
    const firstSetting = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_active', 1)
      .select('system_setting_trade_name', 'system_setting_sidebar_color')
      .first()

    const tradeName = firstSetting?.systemSettingTradeName ?? 'GSTI RH'
    const rawColor = firstSetting?.systemSettingSidebarColor ?? '1e3a5f'
    const sidebarColor = rawColor.startsWith('#') ? rawColor : `#${rawColor}`

    try {
      await mail.send(
        new WorkJournalSealRunSummaryMail({
          to: recipients,
          from,
          tradeName,
          sidebarColor,
          runId: run.workJournalSealRunId,
          status: run.status,
          summary,
        })
      )
    } catch (error) {
      logger.error({ err: error }, 'work-journal:seal-period — error al enviar el correo de resumen')
    }
  }
}
