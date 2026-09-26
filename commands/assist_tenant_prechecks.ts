import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'

/**
 * Pre-checks P0.1–P0.7 de USRH1786566437097 (solo lectura).
 * Compuerta antes del backfill del tenant: el llenado no arranca sin estos números.
 *
 * Uso:
 *   node ace assist:prechecks
 *   node ace assist:prechecks --sample   # P0.4 sobre ~5 % de filas
 *   node ace assist:prechecks --strict   # exit 1 si hay bloqueantes
 */
export default class AssistTenantPrechecks extends BaseCommand {
  static commandName = 'assist:prechecks'
  static description =
    'Mediciones P0.1–P0.7 sobre assists antes del backfill de tenant (USRH1786566437097)'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({
    description: 'P0.4 acotado al 5 % de filas (assist_id % 20 = 0)',
  })
  declare sample: boolean

  @flags.boolean({
    description: 'Termina con código 1 si hay condiciones bloqueantes',
  })
  declare strict: boolean

  async run() {
    let blocked = false

    this.logger.info('=== P0.1 — Volumen y forma ===')
    const [p01] = await db.rawQuery(`
      SELECT COUNT(*) AS filas_totales, MIN(assist_id) AS min_id, MAX(assist_id) AS max_id,
             SUM(assist_deleted_at IS NOT NULL) AS soft_deleted,
             SUM(assist_active = 0) AS inactivas,
             SUM(assist_sync_id = 0) AS origen_local,
             SUM(assist_sync_id <> 0) AS origen_biotime,
             MIN(assist_punch_time_utc) AS primera, MAX(assist_punch_time_utc) AS ultima
      FROM assists
    `)
    this.logRow(p01[0])

    const [p01b] = await db.rawQuery(`
      SELECT table_rows, ROUND(data_length/1024/1024) AS data_mb,
             ROUND(index_length/1024/1024) AS index_mb, row_format, table_collation
      FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'assists'
    `)
    this.logRow(p01b[0])

    this.logger.info('=== P0.2 — NULLs en employees.business_unit_id ===')
    const [p02] = await db.rawQuery(`
      SELECT COUNT(*) AS empleados_totales,
             SUM(business_unit_id IS NULL) AS bu_null,
             SUM(business_unit_id IS NULL AND employee_deleted_at IS NULL) AS bu_null_vivos,
             SUM(business_unit_id IS NULL AND employee_deleted_at IS NOT NULL) AS bu_null_borrados
      FROM employees
    `)
    this.logRow(p02[0])
    const buNull = Number(p02[0]?.bu_null ?? 0)
    if (buNull > 0) {
      this.logger.error(`BLOQUEANTE: bu_null = ${buNull} — resolver en employees antes del backfill`)
      blocked = true
    }

    this.logger.info('=== P0.3 — Ambigüedad de employee_code entre empresas ===')
    const [p03Top] = await db.rawQuery(`
      SELECT e.employee_code, COUNT(DISTINCT e.business_unit_id) AS empresas,
             GROUP_CONCAT(DISTINCT e.business_unit_id ORDER BY e.business_unit_id) AS lista_bu,
             COUNT(*) AS empleados_con_ese_codigo
      FROM employees e
      WHERE e.business_unit_id IS NOT NULL
      GROUP BY e.employee_code
      HAVING COUNT(DISTINCT e.business_unit_id) > 1
      ORDER BY empleados_con_ese_codigo DESC
      LIMIT 10
    `)
    for (const row of p03Top) {
      this.logRow(row)
    }

    const [p03Count] = await db.rawQuery(`
      SELECT COUNT(*) AS checadas_sobre_codigo_ambiguo
      FROM assists a
      WHERE EXISTS (
        SELECT 1 FROM employees e
        WHERE e.employee_code = a.assist_emp_code COLLATE utf8mb4_unicode_ci
          AND e.business_unit_id IS NOT NULL
        GROUP BY e.employee_code
        HAVING COUNT(DISTINCT e.business_unit_id) > 1
      )
    `)
    this.logRow(p03Count[0])

    this.logger.info('=== P0.4 — Cobertura acumulada J3/J2/J1 ===')
    const sampleFilter = this.sample ? 'WHERE a.assist_id % 20 = 0' : ''
    const [p04] = await db.rawQuery(`
      SELECT COUNT(*) AS filas,
        SUM(bu_j3 IS NOT NULL) AS paso1_j3,
        SUM(bu_j3 IS NULL AND bu_j2 IS NOT NULL) AS paso2_j2,
        SUM(bu_j3 IS NULL AND bu_j2 IS NULL AND bu_j1 IS NOT NULL) AS paso3_j1,
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
        ${sampleFilter}
      ) t
    `)
    this.logRow(p04[0])
    const conflictJ3J1 = Number(p04[0]?.conflicto_j3_vs_j1 ?? 0)
    const conflictJ2J1 = Number(p04[0]?.conflicto_j2_vs_j1 ?? 0)
    if (conflictJ3J1 > 0 || conflictJ2J1 > 0) {
      this.logger.error(
        `BLOQUEANTE: conflicto_j3_vs_j1=${conflictJ3J1}, conflicto_j2_vs_j1=${conflictJ2J1}`
      )
      blocked = true
    }

    this.logger.info('=== P0.5 — Terminal SN ===')
    const [p05] = await db.rawQuery(`
      SELECT SUM(assist_terminal_sn IS NULL) AS sn_null,
             SUM(assist_terminal_sn IS NOT NULL AND CHAR_LENGTH(assist_terminal_sn) = 0) AS sn_vacio,
             COUNT(DISTINCT assist_terminal_sn) AS sn_distintos
      FROM assists
    `)
    this.logRow(p05[0])

    this.logger.info('=== P0.6 — Tipos e índices ===')
    const [longCodes] = await db.rawQuery(`
      SELECT COUNT(*) AS codigos_mas_largos_que_200 FROM assists WHERE CHAR_LENGTH(assist_emp_code) > 200
    `)
    this.logRow(longCodes[0])

    this.logger.info('=== P0.7 — Entorno MySQL ===')
    const [p07] = await db.rawQuery(`
      SELECT VERSION() AS mysql_version, @@session.time_zone AS tz_sesion,
             @@global.time_zone AS tz_global, @@sql_mode AS sql_mode,
             @@innodb_default_row_format AS row_format_default
    `)
    this.logRow(p07[0])

    if (this.strict && blocked) {
      this.exitCode = 1
      this.logger.error('Pre-checks fallidos en modo --strict')
    } else {
      this.logger.success('Pre-checks completados (revisar BLOQUEANTE arriba)')
    }
  }

  private logRow(row: Record<string, unknown> | undefined) {
    if (!row) {
      return
    }
    for (const [key, value] of Object.entries(row)) {
      this.logger.info(`  ${key}: ${value}`)
    }
  }
}
