import { BaseMail } from '@adonisjs/mail'
import type { WorkJournalSealRunSummary } from '#models/work_journal_seal_run'

export interface WorkJournalSealRunSummaryMailParams {
  to: string[]
  from: string
  tradeName: string
  sidebarColor: string
  runId: number
  status: 'running' | 'ok' | 'partial' | 'failed'
  summary: WorkJournalSealRunSummary
}

/**
 * Correo interno de operación: resumen de una corrida del job de cierre
 * automático de jornada (USRH1782268640950, regla de negocio #8).
 *
 * Es un aviso operativo (no de cara al empleado final), por lo que el
 * contenido va en español fijo, sin i18n por tenant.
 *
 * Sigue el mismo patrón que `LactationExpiringMail` y
 * `AttendanceFaultHrBatch`: mailer = construcción de variables, plantilla
 * Edge = presentación HTML con estilos inline (compatible Gmail/Outlook).
 */
export default class WorkJournalSealRunSummaryMail extends BaseMail {
  constructor(private readonly params: WorkJournalSealRunSummaryMailParams) {
    super()
  }

  prepare() {
    const { to, from, tradeName, sidebarColor, runId, status, summary } = this.params

    const subject = `[Registro de jornada] Corrida de cierre ${summary.cutoffDate} — ${status}`

    const statusLabel: Record<string, string> = {
      ok: 'Correcto',
      partial: 'Parcial (con errores)',
      failed: 'Fallido',
      running: 'En proceso',
    }

    const errorRows = summary.errors.map((e) => ({
      businessUnitName: e.businessUnitName,
      period: `${this.formatDateDmy(e.periodStart)} — ${this.formatDateDmy(e.periodEnd)}`,
      detail: e.detail,
    }))

    const withoutConfigNames = summary.businessUnitsWithoutConfigNames.join(', ') || '—'

    for (const recipient of to) {
      this.message.to(recipient)
    }
    this.message.from(from, tradeName).subject(subject)

    this.message.htmlView('emails/work_journal_seal_run_summary', {
      subject,
      tradeName,
      sidebarColor,
      runId,
      status,
      statusLabel: statusLabel[status] ?? status,
      cutoffDate: this.formatDateDmy(summary.cutoffDate),
      businessUnitsProcessed: summary.businessUnitsProcessed,
      businessUnitsWithoutConfig: summary.businessUnitsWithoutConfig,
      withoutConfigNames,
      periodsSealed: summary.periodsSealed,
      periodsSkipped: summary.periodsSkipped,
      periodsWithErrors: summary.periodsWithErrors,
      errorRows,
      hasErrors: errorRows.length > 0,
    })
  }

  /**
   * Formatea una fecha ISO (`YYYY-MM-DD`) a `dd/mm/yyyy` sin Luxon para
   * mantener el mailer autónomo (mismo patrón que `LactationExpiringMail`).
   */
  private formatDateDmy(iso: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    if (!match) return iso
    const [, y, m, d] = match
    return `${d}/${m}/${y}`
  }
}
