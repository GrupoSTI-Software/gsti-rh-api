import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { DateTime } from 'luxon'
import PayrollOvertimeBackfillService from '#services/payroll_overtime_backfill_service'
import type {
  PayrollOvertimeBackfillAuditRecord,
  PayrollOvertimeBackfillSummary,
  PayrollOvertimeRevertSummary,
} from '../app/interfaces/payroll_overtime_backfill_interface.js'

/**
 * Comando de backfill histórico del desglose semanal de horas extra (doble/triple).
 *
 * Pobla `overtime_weekly_details` con el pasado usando la **misma lógica** que el
 * reporte de incidencias de nómina (medición + reparto por semana ISO). No modifica
 * el histórico de asistencia original: solo lee y escribe el detalle semanal.
 *
 * **Idempotencia:** re-ejecutar produce el mismo estado (`updateOrCreate` +
 * `withTrashed()` por empleado + año ISO + semana ISO).
 *
 * **Reversibilidad:** `--revert` aplica soft delete por rango/empresa de nómina;
 * un backfill posterior restaura sin duplicar.
 *
 * **Auditoría:** al terminar imprime resumen legible y una línea JSON en log
 * (sin tabla de bitácora en BD — ratificado Wilvardo 2026-07-10).
 *
 * Orden de operación recomendado:
 *   1. `node ace overtime:backfill-weekly --from A --to B --payroll-business-unit-id X --dry-run`
 *   2. Revisar el resumen (empresas, empleados, semanas, minutos doble/triple).
 *   3. Correr sin `--dry-run` en ventana de bajo tráfico, por empresa y por partes.
 *   4. Si algo sale mal: `--revert` con el mismo rango/empresa y volver al paso 1.
 *
 * Uso:
 *   node ace overtime:backfill-weekly --from 2026-01-01 --to 2026-06-30 --dry-run
 *   node ace overtime:backfill-weekly --from 2026-01-01 --to 2026-06-30 --payroll-business-unit-id 12
 *   node ace overtime:backfill-weekly --from 2026-01-01 --to 2026-06-30 --revert --payroll-business-unit-id 12 --dry-run
 *   node ace overtime:backfill-weekly --from 2026-01-01 --to 2026-06-30 --revert --payroll-business-unit-id 12
 */
export default class OvertimeBackfillWeekly extends BaseCommand {
  static commandName = 'overtime:backfill-weekly'
  static description =
    'Migra el histórico de horas extra al detalle semanal por semana ISO (doble/triple)'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.string({
    description:
      'Fecha inicial del rango (YYYY-MM-DD). Obligatorio; sin default — la profundidad se decide al operar.',
  })
  declare from?: string

  @flags.string({
    description:
      'Fecha final del rango (YYYY-MM-DD). Obligatorio; sin default — la profundidad se decide al operar.',
  })
  declare to?: string

  @flags.number({
    description:
      'Acota la corrida a una empresa de nómina (payroll_business_unit_id). ' +
      'Omitir para procesar todas las que tengan empleados con nómina.',
  })
  declare payrollBusinessUnitId?: number

  @flags.boolean({
    description:
      'Modo simulación: calcula medición y reparto, reporta contadores y no escribe ni borra en BD.',
    alias: 'd',
  })
  declare dryRun: boolean

  @flags.boolean({
    description:
      'Modo reversa: soft-delete del detalle migrado en el rango/empresa. ' +
      'Recomendado probar primero con --dry-run.',
  })
  declare revert: boolean

  // ─── punto de entrada ────────────────────────────────────────────────────

  async run() {
    if (!this.validateRequiredFlags()) {
      return
    }

    const dryLabel = this.dryRun ? '[DRY-RUN] ' : ''
    const modeLabel = this.revert ? 'REVERTIR' : 'BACKFILL'
    const payrollBuLabel =
      this.payrollBusinessUnitId !== undefined
        ? `payroll_business_unit_id=${this.payrollBusinessUnitId}`
        : 'todas las empresas de nómina'

    this.logger.info(
      `${dryLabel}Iniciando overtime:backfill-weekly — modo=${modeLabel} — ` +
        `rango=${this.from}..${this.to} — ${payrollBuLabel}`
    )

    if (this.dryRun) {
      this.logger.info(
        `${dryLabel}Modo simulación: se calculará el resultado sin modificar ` +
          '`overtime_weekly_details`.'
      )
    }

    if (this.revert && !this.dryRun) {
      this.logger.warning(
        'Modo --revert activo: se aplicará soft delete al detalle migrado. ' +
          'Confirma el rango y la empresa de nómina antes de continuar.'
      )
    }

    const service = new PayrollOvertimeBackfillService()
    const startedAt = DateTime.utc().toISO()

    try {
      if (this.revert) {
        const summary = await service.runRevert({
          from: this.from!,
          to: this.to!,
          payrollBusinessUnitId: this.payrollBusinessUnitId,
          dryRun: this.dryRun,
        })
        this.printRevertSummary(summary, dryLabel, startedAt)
        this.printAuditRecord('revert', summary)
        this.finishWithExitCode(summary.errors)
        return
      }

      const summary = await service.runBackfill({
        from: this.from!,
        to: this.to!,
        payrollBusinessUnitId: this.payrollBusinessUnitId,
        dryRun: this.dryRun,
      })
      this.printBackfillSummary(summary, dryLabel, startedAt)
      this.printAuditRecord('backfill', summary)
      this.finishWithExitCode(summary.errors)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`${dryLabel}overtime:backfill-weekly abortado: ${message}`)
      this.exitCode = 1
    }
  }

  // ─── validación ──────────────────────────────────────────────────────────

  /**
   * Valida flags obligatorios y coherencia del rango antes de iniciar la corrida.
   * Aborta con mensaje claro y `exitCode = 1` si falta `--from` o `--to`.
   */
  private validateRequiredFlags(): boolean {
    if (!this.from || !this.to) {
      this.logger.error(
        'El rango de fechas es obligatorio. Indique --from y --to en formato YYYY-MM-DD.'
      )
      this.logger.error(
        'Ejemplo: node ace overtime:backfill-weekly --from 2026-01-01 --to 2026-06-30 --dry-run'
      )
      this.exitCode = 1
      return false
    }

    const fromDate = DateTime.fromISO(this.from)
    const toDate = DateTime.fromISO(this.to)

    if (!fromDate.isValid || !toDate.isValid) {
      this.logger.error(
        'Las fechas no son válidas. Use formato ISO YYYY-MM-DD en --from y --to.'
      )
      this.exitCode = 1
      return false
    }

    if (fromDate > toDate) {
      this.logger.error('La fecha --from no puede ser posterior a --to.')
      this.exitCode = 1
      return false
    }

    return true
  }

  // ─── resumen auditable (E5) ──────────────────────────────────────────────

  /**
   * Imprime el resumen legible de una corrida de backfill.
   * Incluye empresas, empleados, semanas, minutos/horas doble-triple y omitidos.
   */
  private printBackfillSummary(
    summary: PayrollOvertimeBackfillSummary,
    dryLabel: string,
    startedAt: string | null
  ) {
    this.logger.info('─────────────────────────────────────────')
    this.logger.info(`${dryLabel}overtime:backfill-weekly completado — modo BACKFILL`)
    if (startedAt) {
      this.logger.info(`  Inicio (UTC)           : ${startedAt}`)
    }
    this.logger.info(`  Fin (UTC)              : ${summary.finishedAt}`)
    this.logger.info(`  Empresas de nómina     : ${summary.payrollBusinessUnits}`)
    this.logger.info(`  Empleados procesados   : ${summary.employeesProcessed}`)
    this.logger.info(`  Omitidos sin nómina    : ${summary.employeesSkippedNoPayroll}`)
    this.logger.info(`  Jornada no resuelta    : ${summary.employeesSkippedUnresolved}`)

    if (this.dryRun) {
      this.logger.info(`  Semanas a persistir    : ${summary.weeksPersisted}`)
      this.logger.info(
        `  Minutos doble (simul.) : ${summary.totalDoubleMinutes} ` +
          `(${summary.totalDoubleHours} h)`
      )
      this.logger.info(
        `  Minutos triple (simul.): ${summary.totalTripleMinutes} ` +
          `(${summary.totalTripleHours} h)`
      )
    } else {
      this.logger.success(`  Semanas persistidas    : ${summary.weeksPersisted}`)
      this.logger.info(
        `  Minutos doble          : ${summary.totalDoubleMinutes} ` +
          `(${summary.totalDoubleHours} h)`
      )
      this.logger.info(
        `  Minutos triple         : ${summary.totalTripleMinutes} ` +
          `(${summary.totalTripleHours} h)`
      )
    }

    if (summary.errors > 0) {
      this.logger.error(`  Errores                : ${summary.errors}`)
    } else {
      this.logger.info(`  Errores                : ${summary.errors}`)
    }

    this.logger.info('─────────────────────────────────────────')
  }

  /**
   * Imprime el resumen legible de una corrida de reversión.
   */
  private printRevertSummary(
    summary: PayrollOvertimeRevertSummary,
    dryLabel: string,
    startedAt: string | null
  ) {
    this.logger.info('─────────────────────────────────────────')
    this.logger.info(`${dryLabel}overtime:backfill-weekly completado — modo REVERTIR`)
    if (startedAt) {
      this.logger.info(`  Inicio (UTC)           : ${startedAt}`)
    }
    this.logger.info(`  Fin (UTC)              : ${summary.finishedAt}`)
    this.logger.info(`  Semanas ISO en rango   : ${summary.isoWeeksInRange}`)
    this.logger.info(`  Empresas de nómina     : ${summary.payrollBusinessUnits}`)

    if (this.dryRun) {
      this.logger.info(`  Registros a revertir   : ${summary.recordsReverted}`)
    } else {
      this.logger.success(`  Registros revertidos   : ${summary.recordsReverted}`)
    }

    if (summary.errors > 0) {
      this.logger.error(`  Errores                : ${summary.errors}`)
    } else {
      this.logger.info(`  Errores                : ${summary.errors}`)
    }

    this.logger.info('─────────────────────────────────────────')
  }

  /**
   * Línea JSON de auditoría para grep en logs del servidor.
   * Formato estable para correlacionar corridas sin tabla de bitácora en BD.
   */
  private printAuditRecord(
    mode: 'backfill' | 'revert',
    summary: PayrollOvertimeBackfillSummary | PayrollOvertimeRevertSummary
  ) {
    const record: PayrollOvertimeBackfillAuditRecord = {
      command: 'overtime:backfill-weekly',
      mode,
      from: this.from!,
      to: this.to!,
      payrollBusinessUnitId: this.payrollBusinessUnitId ?? null,
      dryRun: this.dryRun,
      finishedAt: summary.finishedAt,
      summary,
    }

    this.logger.info(`AUDIT ${JSON.stringify(record)}`)
  }

  /**
   * Cierra la corrida con mensaje de éxito o código de salida 1 si hubo errores.
   */
  private finishWithExitCode(errors: number) {
    if (errors > 0) {
      this.logger.error(
        `overtime:backfill-weekly finalizó con ${errors} error(es). Revise el log anterior.`
      )
      this.exitCode = 1
      return
    }

    if (this.dryRun) {
      this.logger.success(
        'overtime:backfill-weekly completado en simulación. Ningún cambio fue escrito en BD.'
      )
      return
    }

    if (this.revert) {
      this.logger.success('overtime:backfill-weekly: reversión aplicada correctamente.')
      return
    }

    this.logger.success('overtime:backfill-weekly: backfill histórico aplicado correctamente.')
  }
}
