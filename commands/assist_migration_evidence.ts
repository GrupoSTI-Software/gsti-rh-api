import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import AssistMigrationEvidenceService, {
  type ManualResolutionEntry,
  type MigrationEvidenceStep,
} from '#services/assist_migration_evidence_service'
import {
  ASSIST_MIGRATION_EVIDENCE_HU,
  assistMigrationEvidenceDir,
  assistMigrationEvidenceManifestPath,
  assistMigrationEvidenceManualLedgerPath,
} from '#utils/assist_migration_evidence_paths'

interface EvidenceManifest {
  hu: typeof ASSIST_MIGRATION_EVIDENCE_HU
  ca: 'CA-24'
  description: string
  steps: EvidenceStepRecord[]
  manual_resolutions_count: number
}

interface EvidenceStepRecord {
  step: MigrationEvidenceStep
  captured_at: string
  duration_ms: number
  environment: Record<string, unknown>
  counts: Awaited<ReturnType<AssistMigrationEvidenceService['collectCounts']>>
  artifacts: {
    conjunto_a_json: string
    conjunto_b_csv: string
    cuarentena_csv: string
  }
}

/**
 * Evidencia anexa versionada de la migración (USRH1786566437097, §9.8, CA-24).
 * No crea tablas en el producto: artefactos en database/migration_evidence/.
 *
 * Uso:
 *   node ace assist:migration-evidence --step=post-m1
 *   node ace assist:migration-evidence record --assist-id=123 --business-unit-id=1 --rule=manual --executor=user@corp.com
 */
export default class AssistMigrationEvidence extends BaseCommand {
  static commandName = 'assist:migration-evidence'
  static description =
    'Genera o registra evidencia de migración de assists (CA-24, sin tabla en producto)'

  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({
    description: 'Acción: census (default) o record',
    required: false,
  })
  declare action: string

  @flags.string({
    description: 'Paso del runbook: pre-m1 | post-m1 | post-m2 | post-deploy | post-m3 | post-backfill',
  })
  declare step: string

  @flags.number({ description: 'assist_id resuelto a mano (acción record)' })
  declare assistId: number

  @flags.number({ description: 'business_unit_id asignada (acción record)' })
  declare businessUnitId: number

  @flags.string({ description: 'Regla o motivo de la resolución (acción record)' })
  declare rule: string

  @flags.string({ description: 'Ejecutor (email o identificador auditado)' })
  declare executor: string

  @flags.string({ description: 'Notas opcionales (acción record)' })
  declare notes: string

  async run() {
    const action = (this.action ?? 'census').toLowerCase()
    if (action === 'record') {
      await this.runRecord()
      return
    }
    await this.runCensus()
  }

  private async runCensus() {
    const startedAt = DateTime.now()
    const step = this.normalizeStep(this.step)
    const service = new AssistMigrationEvidenceService()

    this.logger.info('=== Evidencia de migración USRH1786566437097 (CA-24) ===')
    this.logger.info(`Paso: ${step}`)

    const counts = await service.collectCounts()
    const conjuntoA = await service.collectConjuntoA()
    const conjuntoB = await service.collectConjuntoB()
    const cuarentena = await service.collectCuarentenaSinEmpresa()

    const dir = assistMigrationEvidenceDir()
    await mkdir(dir, { recursive: true })

    const stamp = DateTime.now().toFormat('yyyyLLdd-HHmmss')
    const conjuntoAPath = join(dir, `conjunto-a-${step}-${stamp}.json`)
    const conjuntoBPath = join(dir, `conjunto-b-${step}-${stamp}.csv`)
    const cuarentenaPath = join(dir, `cuarentena-${step}-${stamp}.csv`)

    await writeFile(conjuntoAPath, JSON.stringify(conjuntoA, null, 2), 'utf8')
    await writeFile(conjuntoBPath, service.conjuntoBToCsv(conjuntoB), 'utf8')
    await writeFile(cuarentenaPath, service.conjuntoBToCsv(cuarentena), 'utf8')

    const [environment] = await db.rawQuery(`
      SELECT VERSION() AS mysql_version, DATABASE() AS database_name,
             @@session.time_zone AS tz_sesion
    `)

    const stepRecord: EvidenceStepRecord = {
      step,
      captured_at: DateTime.now().toISO(),
      duration_ms: DateTime.now().diff(startedAt).toMillis(),
      environment: environment[0] ?? {},
      counts,
      artifacts: {
        conjunto_a_json: conjuntoAPath.replace(`${process.cwd()}/`, ''),
        conjunto_b_csv: conjuntoBPath.replace(`${process.cwd()}/`, ''),
        cuarentena_csv: cuarentenaPath.replace(`${process.cwd()}/`, ''),
      },
    }

    const manifest = await this.mergeManifest(stepRecord)
    const manifestPath = assistMigrationEvidenceManifestPath()
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

    this.logCounts(counts)
    this.logger.info('─────────────────────────────────────────')
    this.logger.info(`  Conjunto A filas : ${conjuntoA.length} grupos (tenant/año)`)
    this.logger.info(`  Conjunto B filas : ${conjuntoB.length}`)
    this.logger.info(`  Cuarentena       : ${cuarentena.length}`)
    this.logger.info(`  Manifiesto       : ${manifestPath}`)
    this.logger.info(`  Ledger manual    : ${assistMigrationEvidenceManualLedgerPath()}`)
    this.logger.info('─────────────────────────────────────────')
    this.logger.success('Evidencia registrada — commitear artefactos junto a la migración')
  }

  private async runRecord() {
    if (
      this.assistId === undefined ||
      this.businessUnitId === undefined ||
      !this.rule ||
      !this.executor
    ) {
      this.logger.error(
        'record requiere --assist-id, --business-unit-id, --rule y --executor'
      )
      this.exitCode = 1
      return
    }

    const entry: ManualResolutionEntry = {
      assist_id: this.assistId,
      business_unit_id: this.businessUnitId,
      rule: this.rule,
      resolved_at: DateTime.now().toISO()!,
      executor: this.executor,
      ...(this.notes ? { notes: this.notes } : {}),
    }

    const ledgerPath = assistMigrationEvidenceManualLedgerPath()
    await mkdir(assistMigrationEvidenceDir(), { recursive: true })
    await appendFile(ledgerPath, `${JSON.stringify(entry)}\n`, 'utf8')

    this.logger.success(
      `Resolución manual registrada: assist_id=${entry.assist_id} → BU ${entry.business_unit_id}`
    )
    this.logger.info(`  Regla    : ${entry.rule}`)
    this.logger.info(`  Ejecutor : ${entry.executor}`)
    this.logger.info(`  Ledger   : ${ledgerPath}`)
    this.logger.warning(
      'El UPDATE en BD es responsabilidad del operador; este comando solo deja constancia.'
    )
  }

  private normalizeStep(raw: string | undefined): MigrationEvidenceStep {
    const allowed: MigrationEvidenceStep[] = [
      'pre-m1',
      'post-m1',
      'post-m2',
      'post-deploy',
      'post-m3',
      'post-backfill',
      'ad-hoc',
    ]
    if (raw && allowed.includes(raw as MigrationEvidenceStep)) {
      return raw as MigrationEvidenceStep
    }
    return 'ad-hoc'
  }

  private async mergeManifest(stepRecord: EvidenceStepRecord): Promise<EvidenceManifest> {
    const manifestPath = assistMigrationEvidenceManifestPath()
    let existing: EvidenceManifest | null = null
    try {
      const raw = await readFile(manifestPath, 'utf8')
      existing = JSON.parse(raw) as EvidenceManifest
    } catch {
      existing = null
    }

    const base: EvidenceManifest = existing ?? {
      hu: ASSIST_MIGRATION_EVIDENCE_HU,
      ca: 'CA-24',
      description:
        'Evidencia anexa versionada de la migración de assists. No es tabla del producto (§9.8).',
      steps: [],
      manual_resolutions_count: 0,
    }

    const stepNames = new Set(base.steps.map((s) => s.step))
    const mergedSteps = [...base.steps]
    if (stepNames.has(stepRecord.step)) {
      const idx = mergedSteps.findIndex((s) => s.step === stepRecord.step)
      mergedSteps[idx] = stepRecord
    } else {
      mergedSteps.push(stepRecord)
    }

    let manualCount = 0
    try {
      const ledger = await readFile(assistMigrationEvidenceManualLedgerPath(), 'utf8')
      manualCount = ledger.split('\n').filter((line) => line.trim().length > 0).length
    } catch {
      manualCount = 0
    }

    return {
      ...base,
      steps: mergedSteps,
      manual_resolutions_count: manualCount,
    }
  }

  private logCounts(counts: Awaited<ReturnType<AssistMigrationEvidenceService['collectCounts']>>) {
    this.logger.info('=== Conteos ===')
    for (const [key, value] of Object.entries(counts)) {
      if (key === 'por_via') {
        this.logger.info(`  ${key}: ${JSON.stringify(value)}`)
      } else {
        this.logger.info(`  ${key}: ${value}`)
      }
    }
  }
}
