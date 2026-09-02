import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { assistChannelSentinel, computeAssistNaturalKey } from '#utils/assist_natural_key'

const DEFAULT_PAGE_SIZE = 1000
const PROGRESS_EVERY_PAGES = 50

interface BackfillCounters {
  processed: number
  assigned: number
  collided: number
  errors: number
}

interface YearBreakdown {
  [year: string]: { processed: number; assigned: number; collided: number }
}

interface TenantBreakdown {
  [businessUnitId: string]: { processed: number; assigned: number; collided: number; byYear: YearBreakdown }
}

/**
 * Backfill post-deploy de `assist_natural_key` (USRH1786566437097).
 * Usa query builder — nunca el modelo Lucid (evita hooks).
 */
export default class BackfillAssistNaturalKey extends BaseCommand {
  static commandName = 'backfill:assist-natural-key'
  static description =
    'Calcula y persiste assist_natural_key en filas históricas (USRH1786566437097)'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({ alias: 'd', description: 'Calcula y reporta sin escribir' })
  declare dryRun: boolean

  @flags.number({ description: 'Acota a una business_unit_id' })
  declare tenant: number

  @flags.number({ description: 'Cursor keyset de reanudación (assist_id > from-id)' })
  declare fromId: number

  @flags.number({ description: 'Cota superior inclusive del rango' })
  declare toId: number

  @flags.number({ description: `Tamaño de página (default ${DEFAULT_PAGE_SIZE})` })
  declare pageSize: number

  async run() {
    const startedAt = DateTime.now()
    const pageSize = this.pageSize ?? DEFAULT_PAGE_SIZE
    let cursor = this.fromId ?? 0
    const counters: BackfillCounters = { processed: 0, assigned: 0, collided: 0, errors: 0 }
    const byTenant: TenantBreakdown = {}
    let pages = 0

    let keepRunning = true
    while (keepRunning) {
      let query = db
        .from('assists')
        .whereNull('assist_natural_key')
        .whereNotNull('business_unit_id')
        .where('assist_id', '>', cursor)
        .orderBy('assist_id', 'asc')
        .limit(pageSize)
        .select(
          'assist_id',
          'business_unit_id',
          'assist_emp_code',
          'assist_punch_time_utc',
          'assist_terminal_sn',
          // El centinela de canal se deriva del origen: sin él este comando escribiría
          // llaves distintas de las que calcula el hook del modelo.
          'assist_origin'
        )

      if (this.tenant !== undefined) {
        query = query.where('business_unit_id', this.tenant)
      }
      if (this.toId !== undefined) {
        query = query.where('assist_id', '<=', this.toId)
      }

      const rows = await query
      if (rows.length === 0) {
        keepRunning = false
        continue
      }

      pages++

      for (const row of rows) {
        counters.processed++
        const buId = Number(row.business_unit_id)
        const year = DateTime.fromJSDate(new Date(row.assist_punch_time_utc)).toUTC().toFormat('yyyy')
        this.ensureBreakdown(byTenant, buId, year)

        const punchUtc = DateTime.fromJSDate(new Date(row.assist_punch_time_utc)).toUTC()
        const key = computeAssistNaturalKey({
          businessUnitId: buId,
          assistEmpCode: row.assist_emp_code,
          assistPunchTimeUtc: punchUtc,
          assistTerminalSn: assistChannelSentinel(row.assist_origin, row.assist_terminal_sn),
        })

        if (this.dryRun) {
          counters.assigned++
          byTenant[String(buId)].assigned++
          byTenant[String(buId)].byYear[year].assigned++
          continue
        }

        try {
          const result = await db
            .from('assists')
            .where('assist_id', row.assist_id)
            .whereNull('assist_natural_key')
            .update({ assist_natural_key: key })

          if (Number(result) === 1) {
            counters.assigned++
            byTenant[String(buId)].assigned++
            byTenant[String(buId)].byYear[year].assigned++
          }
        } catch (error) {
          if (this.isDuplicateKeyError(error)) {
            counters.collided++
            byTenant[String(buId)].collided++
            byTenant[String(buId)].byYear[year].collided++
          } else {
            counters.errors++
            this.logger.error(`[ID ${row.assist_id}] ${(error as Error).message}`)
          }
        }
      }

      cursor = Number(rows[rows.length - 1].assist_id)

      if (pages % PROGRESS_EVERY_PAGES === 0) {
        this.logger.info(
          `cursor=${cursor} procesadas=${counters.processed} asignadas=${counters.assigned} colisionadas=${counters.collided} errores=${counters.errors}`
        )
      }

      if (rows.length < pageSize) keepRunning = false
    }

    const durationMs = DateTime.now().diff(startedAt).toMillis()
    const summary = {
      startedAt: startedAt.toISO(),
      finishedAt: DateTime.now().toISO(),
      durationMs,
      dryRun: this.dryRun === true,
      tenant: this.tenant ?? null,
      fromId: this.fromId ?? 0,
      toId: this.toId ?? null,
      finalCursor: cursor,
      counters,
      byTenant,
    }

    const reportPath = await this.persistSummary(summary)
    this.printSummary(summary, reportPath, durationMs)
  }

  private isDuplicateKeyError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) return false
    return (error as { code?: string }).code === 'ER_DUP_ENTRY'
  }

  private ensureBreakdown(byTenant: TenantBreakdown, buId: number, year: string) {
    const key = String(buId)
    if (!byTenant[key]) {
      byTenant[key] = { processed: 0, assigned: 0, collided: 0, byYear: {} }
    }
    byTenant[key].processed++
    if (!byTenant[key].byYear[year]) {
      byTenant[key].byYear[year] = { processed: 0, assigned: 0, collided: 0 }
    }
    byTenant[key].byYear[year].processed++
  }

  private async persistSummary(summary: Record<string, unknown>): Promise<string> {
    const dir = join(process.cwd(), 'storage', 'backfill')
    await mkdir(dir, { recursive: true })
    const filename = `assist-natural-key-${DateTime.now().toFormat('yyyyLLdd-HHmmss')}.json`
    const reportPath = join(dir, filename)
    await writeFile(reportPath, JSON.stringify(summary, null, 2), 'utf8')
    return reportPath
  }

  private printSummary(
    summary: { counters: BackfillCounters; finalCursor: number; byTenant: TenantBreakdown },
    reportPath: string,
    durationMs: number
  ) {
    const { counters, finalCursor, byTenant } = summary
    this.logger.info('─────────────────────────────────────────')
    this.logger.info(`  Procesadas   : ${counters.processed}`)
    this.logger.info(`  Asignadas    : ${counters.assigned}`)
    this.logger.info(`  Colisionadas : ${counters.collided}`)
    this.logger.info(`  Errores      : ${counters.errors}`)
    this.logger.info(`  Cursor final : ${finalCursor}`)
    this.logger.info(`  Duración     : ${durationMs} ms`)
    this.logger.info(`  Reporte      : ${reportPath}`)
    for (const [buId, stats] of Object.entries(byTenant)) {
      this.logger.info(`  BU ${buId}: asignadas=${stats.assigned} colisionadas=${stats.collided}`)
      for (const [year, yearStats] of Object.entries(stats.byYear)) {
        this.logger.info(
          `    ${year}: proc=${yearStats.processed} asig=${yearStats.assigned} col=${yearStats.collided}`
        )
      }
    }
    this.logger.info('─────────────────────────────────────────')
    this.logger.success(this.dryRun ? 'Dry-run completado' : 'Backfill completado')
  }
}
