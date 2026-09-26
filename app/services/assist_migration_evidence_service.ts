import db from '@adonisjs/lucid/services/db'

export type MigrationEvidenceStep =
  | 'pre-m1'
  | 'post-m1'
  | 'post-m2'
  | 'post-deploy'
  | 'post-m3'
  | 'post-backfill'
  | 'ad-hoc'

export interface ConjuntoARow {
  business_unit_id: number
  anio: number
  duplicados: number
}

export interface ConjuntoBRow {
  assist_id: number
  assist_emp_code: string
  assist_emp_id: number
  assist_sync_id: number
  assist_terminal_sn: string | null
  assist_punch_time_utc: string
  business_unit_id: number | null
}

export interface ViaBackfillCounts {
  j3: number
  j2: number
  j1: number
  sin_resolver: number
  conflicto_j3_vs_j1: number
  conflicto_j2_vs_j1: number
}

export interface MigrationEvidenceCounts {
  filas_totales: number
  conjunto_a_duplicados_llave_null: number
  conjunto_b_sin_empresa: number
  conjunto_b_empleado_no_encontrado: number
  business_unit_id_null: number
  assist_natural_key_null: number
  por_via: ViaBackfillCounts
}

export interface ManualResolutionEntry {
  assist_id: number
  business_unit_id: number
  rule: string
  resolved_at: string
  executor: string
  notes?: string
}

/**
 * Censo y exportación de evidencia de migración (USRH1786566437097, §9.8, CA-24).
 * Solo lectura salvo el ledger de resoluciones manuales (append-only en disco).
 */
export default class AssistMigrationEvidenceService {
  async collectCounts(): Promise<MigrationEvidenceCounts> {
    const [totals] = await db.rawQuery(`
      SELECT COUNT(*) AS filas_totales,
             SUM(business_unit_id IS NULL) AS business_unit_id_null,
             SUM(assist_natural_key IS NULL) AS assist_natural_key_null
      FROM assists
    `)
    const row = totals[0] ?? {}

    const [conjuntoA] = await db.rawQuery(`
      SELECT COUNT(*) AS n FROM assists
      WHERE assist_natural_key IS NULL AND business_unit_id IS NOT NULL
    `)

    const [conjuntoB] = await db.rawQuery(`
      SELECT COUNT(*) AS n FROM assists WHERE business_unit_id IS NULL
    `)

    const [conjuntoBEmpleado] = await db.rawQuery(`
      SELECT COUNT(*) AS n
      FROM assists a
      WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.employee_id = a.assist_emp_id)
        AND NOT EXISTS (
          SELECT 1 FROM employees e
          WHERE e.employee_sync_id IS NOT NULL
            AND e.employee_sync_id <> '0'
            AND CAST(e.employee_sync_id AS UNSIGNED) = a.assist_emp_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM employees e
          WHERE e.employee_code COLLATE utf8mb4_unicode_ci = a.assist_emp_code COLLATE utf8mb4_unicode_ci
        )
    `)

    const porVia = await this.collectViaBackfillCounts()

    return {
      filas_totales: Number(row.filas_totales ?? 0),
      conjunto_a_duplicados_llave_null: Number(conjuntoA[0]?.n ?? 0),
      conjunto_b_sin_empresa: Number(conjuntoB[0]?.n ?? 0),
      conjunto_b_empleado_no_encontrado: Number(conjuntoBEmpleado[0]?.n ?? 0),
      business_unit_id_null: Number(row.business_unit_id_null ?? 0),
      assist_natural_key_null: Number(row.assist_natural_key_null ?? 0),
      por_via: porVia,
    }
  }

  async collectConjuntoA(): Promise<ConjuntoARow[]> {
    const [rows] = await db.rawQuery(`
      SELECT business_unit_id,
             YEAR(assist_punch_time_utc) AS anio,
             COUNT(*) AS duplicados
      FROM assists
      WHERE assist_natural_key IS NULL AND business_unit_id IS NOT NULL
      GROUP BY business_unit_id, YEAR(assist_punch_time_utc)
      ORDER BY duplicados DESC
    `)
    return rows.map((r: Record<string, unknown>) => ({
      business_unit_id: Number(r.business_unit_id),
      anio: Number(r.anio),
      duplicados: Number(r.duplicados),
    }))
  }

  async collectConjuntoB(): Promise<ConjuntoBRow[]> {
    const [rows] = await db.rawQuery(`
      SELECT a.assist_id, a.assist_emp_code, a.assist_emp_id, a.assist_sync_id,
             a.assist_terminal_sn, a.assist_punch_time_utc, a.business_unit_id
      FROM assists a
      WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.employee_id = a.assist_emp_id)
        AND NOT EXISTS (
          SELECT 1 FROM employees e
          WHERE e.employee_sync_id IS NOT NULL
            AND e.employee_sync_id <> '0'
            AND CAST(e.employee_sync_id AS UNSIGNED) = a.assist_emp_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM employees e
          WHERE e.employee_code COLLATE utf8mb4_unicode_ci = a.assist_emp_code COLLATE utf8mb4_unicode_ci
        )
      ORDER BY a.assist_id
    `)
    return rows.map((r: Record<string, unknown>) => ({
      assist_id: Number(r.assist_id),
      assist_emp_code: String(r.assist_emp_code ?? ''),
      assist_emp_id: Number(r.assist_emp_id),
      assist_sync_id: Number(r.assist_sync_id),
      assist_terminal_sn: r.assist_terminal_sn === null ? null : String(r.assist_terminal_sn),
      assist_punch_time_utc: String(r.assist_punch_time_utc),
      business_unit_id: r.business_unit_id === null ? null : Number(r.business_unit_id),
    }))
  }

  async collectCuarentenaSinEmpresa(): Promise<ConjuntoBRow[]> {
    const [rows] = await db.rawQuery(`
      SELECT a.assist_id, a.assist_emp_code, a.assist_emp_id, a.assist_sync_id,
             a.assist_terminal_sn, a.assist_punch_time_utc, a.business_unit_id
      FROM assists a
      WHERE a.business_unit_id IS NULL
      ORDER BY a.assist_id
    `)
    return rows.map((r: Record<string, unknown>) => ({
      assist_id: Number(r.assist_id),
      assist_emp_code: String(r.assist_emp_code ?? ''),
      assist_emp_id: Number(r.assist_emp_id),
      assist_sync_id: Number(r.assist_sync_id),
      assist_terminal_sn: r.assist_terminal_sn === null ? null : String(r.assist_terminal_sn),
      assist_punch_time_utc: String(r.assist_punch_time_utc),
      business_unit_id: null,
    }))
  }

  private async collectViaBackfillCounts(): Promise<ViaBackfillCounts> {
    const [p04] = await db.rawQuery(`
      SELECT SUM(bu_j3 IS NOT NULL) AS j3,
             SUM(bu_j3 IS NULL AND bu_j2 IS NOT NULL) AS j2,
             SUM(bu_j3 IS NULL AND bu_j2 IS NULL AND bu_j1 IS NOT NULL) AS j1,
             SUM(bu_j3 IS NULL AND bu_j2 IS NULL AND bu_j1 IS NULL) AS sin_resolver,
             SUM(bu_j3 IS NOT NULL AND bu_j1 IS NOT NULL AND bu_j3 <> bu_j1) AS conflicto_j3_vs_j1,
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
    const row = p04[0] ?? {}
    return {
      j3: Number(row.j3 ?? 0),
      j2: Number(row.j2 ?? 0),
      j1: Number(row.j1 ?? 0),
      sin_resolver: Number(row.sin_resolver ?? 0),
      conflicto_j3_vs_j1: Number(row.conflicto_j3_vs_j1 ?? 0),
      conflicto_j2_vs_j1: Number(row.conflicto_j2_vs_j1 ?? 0),
    }
  }

  conjuntoBToCsv(rows: ConjuntoBRow[]): string {
    const header =
      'assist_id,assist_emp_code,assist_emp_id,assist_sync_id,assist_terminal_sn,assist_punch_time_utc,business_unit_id'
    const lines = rows.map((row) => {
      const sn = row.assist_terminal_sn ?? ''
      const escapedSn = sn.includes(',') ? `"${sn.replace(/"/g, '""')}"` : sn
      const bu = row.business_unit_id === null ? '' : String(row.business_unit_id)
      return [
        row.assist_id,
        row.assist_emp_code,
        row.assist_emp_id,
        row.assist_sync_id,
        escapedSn,
        row.assist_punch_time_utc,
        bu,
      ].join(',')
    })
    return [header, ...lines].join('\n')
  }
}
