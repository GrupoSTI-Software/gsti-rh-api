import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { computeAssistNaturalKey } from '#utils/assist_natural_key'

/** Empresas vivas del ensayo (CA-21, §9.9). */
const TRIAL_BU1_ID = 1
const TRIAL_BU6_ID = 6

type TrialStep =
  | 'pre-m1'
  | 'post-m1'
  | 'post-m2'
  | 'post-deploy'
  | 'post-m3'
  | 'post-backfill'
  | 'ad-hoc'

interface TrialCensus {
  filas_totales: number
  business_unit_id_null: number
  business_unit_id_asignado: number
  assist_natural_key_null: number
  assist_natural_key_asignado: number
  sin_resolver: number | null
  orfanas: number | null
  grupos_duplicados: number | null
  filas_en_grupos_duplicados: number | null
  filas_que_quedaran_en_null: number | null
  por_tenant: Record<string, { filas: number; llave_null: number; llave_asignada: number }>
}

interface TrialTimings {
  m1_duration_ms?: number
  m3_duration_ms?: number
  backfill_dry_run_ms?: number
  backfill_dry_run_processed?: number
}

interface TrialStepRecord {
  step: TrialStep
  captured_at: string
  duration_ms: number
  schema: Record<string, unknown>
  census: TrialCensus
  prechecks: Record<string, unknown>
  timings: TrialTimings
}

interface TrialManifest {
  hu: 'USRH1786566437097'
  ca: 'CA-21'
  tenants: {
    bu1: { id: number; slug: string | null; public_id: string | null; assists: number }
    bu6: { id: number; slug: string | null; public_id: string | null; assists: number }
  }
  environment: Record<string, unknown>
  steps: TrialStepRecord[]
}

/**
 * Ensayo completo de aislamiento de assists (USRH1786566437097, §9.9, CA-21).
 * Captura conteos por paso y tiempos medidos; condición para autorizar despliegue.
 *
 * Uso en staging (copia con BU1 sae + BU6 cima):
 *   node ace assist:trial --step=pre-m1
 *   node ace migration:run   # M1
 *   node ace assist:trial --step=post-m1 --m1-duration-ms=12345
 *   ...
 *   node ace assist:trial --step=post-backfill --measure-backfill
 */
export default class AssistTenantTrial extends BaseCommand {
  static commandName = 'assist:trial'
  static description =
    'Ensayo CA-21: censo de assists en entorno de 2 empresas vivas (USRH1786566437097)'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.string({
    description:
      'Etiqueta del paso: pre-m1 | post-m1 | post-m2 | post-deploy | post-m3 | post-backfill | ad-hoc',
  })
  declare step: string

  @flags.number({ description: 'Duración medida de M1 (ms), para el manifiesto' })
  declare m1DurationMs: number

  @flags.number({ description: 'Duración medida de M3 (ms), para el manifiesto' })
  declare m3DurationMs: number

  @flags.boolean({
    description: 'Mide tiempo de backfill en dry-run sobre filas pendientes de llave',
  })
  declare measureBackfill: boolean

  async run() {
    const startedAt = DateTime.now()
    const step = this.normalizeStep(this.step)

    this.logger.info('=== Ensayo USRH1786566437097 (CA-21) ===')
    this.logger.info(`Paso: ${step}`)

    const tenants = await this.resolveTrialTenants()
    this.logTenants(tenants)

    const schema = await this.detectSchemaState()
    this.logSchema(schema)

    const census = await this.collectCensus()
    this.logCensus(census)

    const prechecks = await this.collectPrechecks()
    this.logPrechecks(prechecks)

    const timings: TrialTimings = {}
    if (this.m1DurationMs !== undefined) timings.m1_duration_ms = this.m1DurationMs
    if (this.m3DurationMs !== undefined) timings.m3_duration_ms = this.m3DurationMs

    if (this.measureBackfill) {
      const backfillTiming = await this.measureBackfillDryRun()
      timings.backfill_dry_run_ms = backfillTiming.durationMs
      timings.backfill_dry_run_processed = backfillTiming.processed
      this.logger.info(
        `Backfill dry-run: ${backfillTiming.processed} filas en ${backfillTiming.durationMs} ms`
      )
    }

    const durationMs = DateTime.now().diff(startedAt).toMillis()
    const [environment] = await db.rawQuery(`
      SELECT VERSION() AS mysql_version, DATABASE() AS database_name,
             @@session.time_zone AS tz_sesion, @@global.time_zone AS tz_global
    `)

    const stepRecord: TrialStepRecord = {
      step,
      captured_at: DateTime.now().toISO(),
      duration_ms: durationMs,
      schema,
      census,
      prechecks,
      timings,
    }

    const manifest = await this.mergeManifest({
      hu: 'USRH1786566437097',
      ca: 'CA-21',
      tenants,
      environment: environment[0] ?? {},
      steps: [stepRecord],
    })

    const reportPath = await this.persistStepReport(stepRecord)
    const manifestPath = await this.persistManifest(manifest)

    this.logger.info('─────────────────────────────────────────')
    this.logger.info(`  Paso registrado : ${step}`)
    this.logger.info(`  Duración censo  : ${durationMs} ms`)
    if (timings.m1_duration_ms !== undefined) {
      this.logger.info(`  M1 medido       : ${timings.m1_duration_ms} ms`)
    }
    if (timings.m3_duration_ms !== undefined) {
      this.logger.info(`  M3 medido       : ${timings.m3_duration_ms} ms`)
    }
    if (timings.backfill_dry_run_ms !== undefined) {
      this.logger.info(
        `  Backfill dry-run: ${timings.backfill_dry_run_processed} filas / ${timings.backfill_dry_run_ms} ms`
      )
    }
    this.logger.info(`  Reporte paso    : ${reportPath}`)
    this.logger.info(`  Manifiesto      : ${manifestPath}`)
    this.logger.info('─────────────────────────────────────────')
    this.logger.success('Ensayo registrado — revisar conteos antes de autorizar despliegue')
  }

  private normalizeStep(raw: string | undefined): TrialStep {
    const allowed: TrialStep[] = [
      'pre-m1',
      'post-m1',
      'post-m2',
      'post-deploy',
      'post-m3',
      'post-backfill',
      'ad-hoc',
    ]
    if (raw && allowed.includes(raw as TrialStep)) {
      return raw as TrialStep
    }
    return 'ad-hoc'
  }

  private async resolveTrialTenants() {
    const [rows] = await db.rawQuery(
      `
      SELECT business_unit_id, business_unit_slug, business_unit_public_id
      FROM business_units
      WHERE business_unit_id IN (?, ?)
    `,
      [TRIAL_BU1_ID, TRIAL_BU6_ID]
    )

    const byId = new Map<number, { slug: string | null; public_id: string | null }>()
    for (const row of rows) {
      byId.set(Number(row.business_unit_id), {
        slug: row.business_unit_slug ?? null,
        public_id: row.business_unit_public_id ?? null,
      })
    }

    if (!byId.has(TRIAL_BU1_ID) || !byId.has(TRIAL_BU6_ID)) {
      this.logger.warning(
        `Faltan tenants del ensayo (se esperan id=${TRIAL_BU1_ID} sae e id=${TRIAL_BU6_ID} cima)`
      )
    }

    const [counts] = await db.rawQuery(`
      SELECT business_unit_id, COUNT(*) AS filas
      FROM assists
      WHERE business_unit_id IN (${TRIAL_BU1_ID}, ${TRIAL_BU6_ID})
      GROUP BY business_unit_id
    `)
    const countByBu = new Map<number, number>()
    for (const row of counts) {
      countByBu.set(Number(row.business_unit_id), Number(row.filas))
    }

    const bu1 = byId.get(TRIAL_BU1_ID)
    const bu6 = byId.get(TRIAL_BU6_ID)

    return {
      bu1: {
        id: TRIAL_BU1_ID,
        slug: bu1?.slug ?? null,
        public_id: bu1?.public_id ?? null,
        assists: countByBu.get(TRIAL_BU1_ID) ?? 0,
      },
      bu6: {
        id: TRIAL_BU6_ID,
        slug: bu6?.slug ?? null,
        public_id: bu6?.public_id ?? null,
        assists: countByBu.get(TRIAL_BU6_ID) ?? 0,
      },
    }
  }

  private async detectSchemaState() {
    const [columns] = await db.rawQuery(`
      SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE, COLUMN_KEY
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assists'
        AND COLUMN_NAME IN ('business_unit_id', 'assist_natural_key')
    `)

    const [fks] = await db.rawQuery(`
      SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assists'
        AND COLUMN_NAME = 'business_unit_id' AND REFERENCED_TABLE_NAME IS NOT NULL
    `)

    const colMap = new Map<string, Record<string, unknown>>()
    for (const col of columns) {
      colMap.set(String(col.COLUMN_NAME), col)
    }

    const buCol = colMap.get('business_unit_id')
    const keyCol = colMap.get('assist_natural_key')

    return {
      m1_applied: Boolean(buCol),
      m2_applied: Boolean(keyCol),
      m3_applied: buCol ? buCol.IS_NULLABLE === 'NO' : false,
      fk_applied: fks.length > 0,
      business_unit_id_nullable: buCol?.IS_NULLABLE ?? null,
      assist_natural_key_nullable: keyCol?.IS_NULLABLE ?? null,
      unique_natural_key: keyCol?.COLUMN_KEY === 'UNI',
    }
  }

  private async collectCensus(): Promise<TrialCensus> {
    const [totals] = await db.rawQuery(`
      SELECT COUNT(*) AS filas_totales,
             SUM(business_unit_id IS NULL) AS business_unit_id_null,
             SUM(business_unit_id IS NOT NULL) AS business_unit_id_asignado,
             SUM(assist_natural_key IS NULL) AS assist_natural_key_null,
             SUM(assist_natural_key IS NOT NULL) AS assist_natural_key_asignado
      FROM assists
    `)
    const row = totals[0] ?? {}

    let sinResolver: number | null = null
    const [schema] = await db.rawQuery(`
      SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assists'
        AND COLUMN_NAME = 'business_unit_id'
    `)
    if (Number(schema[0]?.n ?? 0) > 0) {
      const [unresolved] = await db.rawQuery(`
        SELECT COUNT(*) AS sin_resolver FROM assists WHERE business_unit_id IS NULL
      `)
      sinResolver = Number(unresolved[0]?.sin_resolver ?? 0)
    }

    let orfanas: number | null = null
    if (Number(schema[0]?.n ?? 0) > 0) {
      const [orphan] = await db.rawQuery(`
        SELECT COUNT(*) AS orfanas
        FROM assists a
        LEFT JOIN employees e ON e.employee_code = a.assist_emp_code
                             AND e.business_unit_id = a.business_unit_id
        WHERE a.business_unit_id IS NOT NULL AND e.employee_id IS NULL
      `)
      orfanas = Number(orphan[0]?.orfanas ?? 0)
    }

    let gruposDuplicados: number | null = null
    let filasEnGrupos: number | null = null
    let filasEnNull: number | null = null
    const [keyCol] = await db.rawQuery(`
      SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assists'
        AND COLUMN_NAME IN ('business_unit_id', 'assist_natural_key')
    `)
    if (Number(keyCol[0]?.n ?? 0) >= 2) {
      const [dupes] = await db.rawQuery(`
        SELECT COUNT(*) AS grupos_duplicados,
               SUM(n) AS filas_en_grupos,
               SUM(n - 1) AS filas_que_quedaran_en_null
        FROM (
          SELECT COUNT(*) AS n FROM assists a
          WHERE a.business_unit_id IS NOT NULL
          GROUP BY a.business_unit_id, a.assist_emp_code, a.assist_punch_time_utc,
                   CASE WHEN a.assist_terminal_sn IS NULL OR CHAR_LENGTH(a.assist_terminal_sn) = 0
                        THEN '__NO_SN__' ELSE a.assist_terminal_sn END
          HAVING COUNT(*) > 1
        ) g
      `)
      gruposDuplicados = Number(dupes[0]?.grupos_duplicados ?? 0)
      filasEnGrupos = Number(dupes[0]?.filas_en_grupos ?? 0)
      filasEnNull = Number(dupes[0]?.filas_que_quedaran_en_null ?? 0)
    }

    const [byTenant] = await db.rawQuery(`
      SELECT business_unit_id,
             COUNT(*) AS filas,
             SUM(assist_natural_key IS NULL) AS llave_null,
             SUM(assist_natural_key IS NOT NULL) AS llave_asignada
      FROM assists
      WHERE business_unit_id IN (${TRIAL_BU1_ID}, ${TRIAL_BU6_ID})
      GROUP BY business_unit_id
    `)
    const porTenant: TrialCensus['por_tenant'] = {}
    for (const tenantRow of byTenant) {
      porTenant[String(tenantRow.business_unit_id)] = {
        filas: Number(tenantRow.filas),
        llave_null: Number(tenantRow.llave_null),
        llave_asignada: Number(tenantRow.llave_asignada),
      }
    }

    return {
      filas_totales: Number(row.filas_totales ?? 0),
      business_unit_id_null: Number(row.business_unit_id_null ?? 0),
      business_unit_id_asignado: Number(row.business_unit_id_asignado ?? 0),
      assist_natural_key_null: Number(row.assist_natural_key_null ?? 0),
      assist_natural_key_asignado: Number(row.assist_natural_key_asignado ?? 0),
      sin_resolver: sinResolver,
      orfanas,
      grupos_duplicados: gruposDuplicados,
      filas_en_grupos_duplicados: filasEnGrupos,
      filas_que_quedaran_en_null: filasEnNull,
      por_tenant: porTenant,
    }
  }

  private async collectPrechecks() {
    const [p02] = await db.rawQuery(`
      SELECT SUM(business_unit_id IS NULL) AS bu_null FROM employees
    `)
    const [p03] = await db.rawQuery(`
      SELECT COUNT(*) AS codigos_ambiguos FROM (
        SELECT employee_code FROM employees
        WHERE business_unit_id IS NOT NULL
        GROUP BY employee_code
        HAVING COUNT(DISTINCT business_unit_id) > 1
      ) t
    `)
    const [p04] = await db.rawQuery(`
      SELECT SUM(bu_j3 IS NOT NULL AND bu_j1 IS NOT NULL AND bu_j3 <> bu_j1) AS conflicto_j3_vs_j1,
             SUM(bu_j2 IS NOT NULL AND bu_j1 IS NOT NULL AND bu_j2 <> bu_j1) AS conflicto_j2_vs_j1
      FROM (
        SELECT
          (SELECT MIN(e.business_unit_id) FROM employees e
            WHERE a.assist_sync_id <> 0
              AND CAST(e.employee_sync_id AS UNSIGNED) = a.assist_emp_id
              AND e.employee_sync_id <> '0' AND e.business_unit_id IS NOT NULL
            GROUP BY CAST(e.employee_sync_id AS UNSIGNED)
            HAVING COUNT(DISTINCT e.business_unit_id) = 1) AS bu_j3,
          (SELECT e.business_unit_id FROM employees e
            WHERE a.assist_sync_id = 0 AND e.employee_id = a.assist_emp_id
              AND e.business_unit_id IS NOT NULL) AS bu_j2,
          (SELECT MIN(e.business_unit_id) FROM employees e
            WHERE e.employee_code = a.assist_emp_code COLLATE utf8mb4_unicode_ci
              AND e.business_unit_id IS NOT NULL
            GROUP BY e.employee_code HAVING COUNT(DISTINCT e.business_unit_id) = 1) AS bu_j1
        FROM assists a
      ) t
    `)
    return {
      employees_bu_null: Number(p02[0]?.bu_null ?? 0),
      codigos_ambiguos: Number(p03[0]?.codigos_ambiguos ?? 0),
      conflicto_j3_vs_j1: Number(p04[0]?.conflicto_j3_vs_j1 ?? 0),
      conflicto_j2_vs_j1: Number(p04[0]?.conflicto_j2_vs_j1 ?? 0),
    }
  }

  private async measureBackfillDryRun() {
    const startedAt = DateTime.now()
    let processed = 0
    let cursor = 0
    const pageSize = 1000

    let keepRunning = true
    while (keepRunning) {
      const rows = await db
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
          'assist_terminal_sn'
        )

      if (rows.length === 0) {
        keepRunning = false
        continue
      }

      for (const row of rows) {
        processed++
        const punchUtc = DateTime.fromJSDate(new Date(row.assist_punch_time_utc)).toUTC()
        computeAssistNaturalKey({
          businessUnitId: Number(row.business_unit_id),
          assistEmpCode: row.assist_emp_code,
          assistPunchTimeUtc: punchUtc,
          assistTerminalSn: row.assist_terminal_sn,
        })
      }

      cursor = Number(rows[rows.length - 1].assist_id)
      if (rows.length < pageSize) keepRunning = false
    }

    return { processed, durationMs: DateTime.now().diff(startedAt).toMillis() }
  }

  private async mergeManifest(partial: TrialManifest): Promise<TrialManifest> {
    const manifestPath = this.manifestPath()
    let existing: TrialManifest | null = null
    try {
      const raw = await readFile(manifestPath, 'utf8')
      existing = JSON.parse(raw) as TrialManifest
    } catch {
      existing = null
    }

    if (!existing) {
      return partial
    }

    const stepNames = new Set(existing.steps.map((s) => s.step))
    const mergedSteps = [...existing.steps]
    for (const step of partial.steps) {
      if (stepNames.has(step.step)) {
        const idx = mergedSteps.findIndex((s) => s.step === step.step)
        mergedSteps[idx] = step
      } else {
        mergedSteps.push(step)
      }
    }

    return {
      ...existing,
      tenants: partial.tenants,
      environment: partial.environment,
      steps: mergedSteps,
    }
  }

  private manifestPath() {
    return join(process.cwd(), 'storage', 'backfill', 'assist-tenant-trial-manifest.json')
  }

  private async persistStepReport(stepRecord: TrialStepRecord) {
    const dir = join(process.cwd(), 'storage', 'backfill')
    await mkdir(dir, { recursive: true })
    const filename = `assist-tenant-trial-${stepRecord.step}-${DateTime.now().toFormat('yyyyLLdd-HHmmss')}.json`
    const reportPath = join(dir, filename)
    await writeFile(reportPath, JSON.stringify(stepRecord, null, 2), 'utf8')
    return reportPath
  }

  private async persistManifest(manifest: TrialManifest) {
    const path = this.manifestPath()
    await mkdir(join(process.cwd(), 'storage', 'backfill'), { recursive: true })
    await writeFile(path, JSON.stringify(manifest, null, 2), 'utf8')
    return path
  }

  private logTenants(tenants: TrialManifest['tenants']) {
    this.logger.info('=== Tenants del ensayo ===')
    this.logger.info(
      `  BU1 id=${tenants.bu1.id} slug=${tenants.bu1.slug} assists=${tenants.bu1.assists}`
    )
    this.logger.info(
      `  BU6 id=${tenants.bu6.id} slug=${tenants.bu6.slug} assists=${tenants.bu6.assists}`
    )
  }

  private logSchema(schema: Record<string, unknown>) {
    this.logger.info('=== Estado del esquema ===')
    for (const [key, value] of Object.entries(schema)) {
      this.logger.info(`  ${key}: ${value}`)
    }
  }

  private logCensus(census: TrialCensus) {
    this.logger.info('=== Censo ===')
    for (const [key, value] of Object.entries(census)) {
      if (key === 'por_tenant') {
        this.logger.info(`  ${key}: ${JSON.stringify(value)}`)
      } else {
        this.logger.info(`  ${key}: ${value}`)
      }
    }
  }

  private logPrechecks(prechecks: Record<string, unknown>) {
    this.logger.info('=== Pre-checks embebidos ===')
    for (const [key, value] of Object.entries(prechecks)) {
      this.logger.info(`  ${key}: ${value}`)
    }
  }
}
