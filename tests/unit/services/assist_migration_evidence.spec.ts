import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import AssistMigrationEvidenceService from '#services/assist_migration_evidence_service'
import {
  ASSIST_MIGRATION_EVIDENCE_HU,
  assistMigrationEvidenceDir,
  assistMigrationEvidenceManifestPath,
} from '#utils/assist_migration_evidence_paths'

/**
 * USRH1786566437097 — entregable 15 / CA-24 evidencia anexa versionada.
 */

const EVIDENCE_DIR = assistMigrationEvidenceDir()
const README = join(EVIDENCE_DIR, 'README.md')
const SCHEMA = join(EVIDENCE_DIR, 'manifest.schema.json')
const COMMAND_FILE = join(process.cwd(), 'commands/assist_migration_evidence.ts')

test.group('Assist migration evidence — artefactos versionados (CA-24)', () => {
  test('existe directorio de evidencia junto a migraciones', ({ assert }) => {
    assert.equal(
      assistMigrationEvidenceDir(),
      join(process.cwd(), 'database', 'migration_evidence', ASSIST_MIGRATION_EVIDENCE_HU)
    )
  })

  test('README documenta ledger manual y runbook', ({ assert }) => {
    const content = readFileSync(README, 'utf-8')
    assert.include(content, 'manual-resolutions.jsonl')
    assert.include(content, 'assist:migration-evidence')
    assert.include(content, 'Conjunto A')
    assert.include(content, 'Conjunto B')
  })

  test('manifest.schema.json define conteos y pasos del runbook', ({ assert }) => {
    const schema = JSON.parse(readFileSync(SCHEMA, 'utf-8'))
    assert.equal(schema.properties.hu.const, ASSIST_MIGRATION_EVIDENCE_HU)
    assert.deepInclude(schema.properties.steps.items.properties.step.enum, 'post-m1')
    assert.property(
      schema.properties.steps.items.properties.counts.properties,
      'conjunto_b_sin_empresa'
    )
  })

  test('comando Ace genera censo sin tabla en producto', ({ assert }) => {
    const content = readFileSync(COMMAND_FILE, 'utf-8')
    assert.include(content, "static commandName = 'assist:migration-evidence'")
    assert.include(content, 'assistMigrationEvidenceManualLedgerPath')
    assert.include(content, 'assistMigrationEvidenceManifestPath')
    assert.notInclude(content, 'createTable')
  })

  test('servicio exporta CSV del conjunto B con columnas del spec', ({ assert }) => {
    const service = new AssistMigrationEvidenceService()
    const csv = service.conjuntoBToCsv([
      {
        assist_id: 1,
        assist_emp_code: 'E001',
        assist_emp_id: 99,
        assist_sync_id: 0,
        assist_terminal_sn: 'SN-1',
        assist_punch_time_utc: '2026-01-01 08:00:00',
        business_unit_id: null,
      },
    ])
    assert.include(csv, 'assist_id,assist_emp_code')
    assert.include(csv, '1,E001,99,0,SN-1')
  })

  test('ruta del manifiesto cae bajo database/migration_evidence', ({ assert }) => {
    assert.include(assistMigrationEvidenceManifestPath(), 'database/migration_evidence')
  })
})
