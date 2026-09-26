import { join } from 'node:path'

/** HU USRH1786566437097 — evidencia anexa versionada junto a las migraciones (CA-24, §9.8). */
export const ASSIST_MIGRATION_EVIDENCE_HU = 'USRH1786566437097'

/** Fuera de `database/migrations/`: Lucid carga todo ese árbol como migraciones. */
export function assistMigrationEvidenceDir(): string {
  return join(process.cwd(), 'database', 'migration_evidence', ASSIST_MIGRATION_EVIDENCE_HU)
}

export function assistMigrationEvidenceManifestPath(): string {
  return join(assistMigrationEvidenceDir(), 'manifest.json')
}

export function assistMigrationEvidenceManualLedgerPath(): string {
  return join(assistMigrationEvidenceDir(), 'manual-resolutions.jsonl')
}
