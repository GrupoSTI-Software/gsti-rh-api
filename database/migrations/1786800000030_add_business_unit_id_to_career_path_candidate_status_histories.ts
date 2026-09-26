import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Cierre de deuda estructural (USRH1786648600061) — `career_path_candidate_status_histories`
 * es la última tabla de datos de cliente del módulo de rutas de carrera sin
 * marca de pertenencia propia. Hoy no hay fuga viva: solo se llega al
 * historial abriendo la propuesta padre (`career_path_candidates`), que ya
 * está aislada (`USRH1784259058533`). Es un candado prestado: la primera
 * consulta que se escriba sin pasar por el padre queda sin filtro, en
 * silencio, porque el mixin es fail-OPEN sin `TenantContext` activo.
 *
 * Backfill de 1 solo salto (el padre ya tiene la marca, `USRH1786595131484`):
 * `career_path_candidates.business_unit_id` es NOT NULL con FK desde su
 * creación (`1776968002402:10`), y la FK `career_path_candidate_id` del
 * historial también es NOT NULL (`1776968033561:10`) — no hay eslabón
 * nullable en la cadena, por lo que se esperan cero huérfanos.
 *
 * `WHERE business_unit_id IS NULL` ⇒ idempotente, re-corrible.
 *
 * Pre-check bloqueante entre el UPDATE y el DDL (regla 9): si algún
 * registro no resuelve dueño contra su propuesta padre, la migración
 * aborta con `throw` y NO ejecuta el `MODIFY ... NOT NULL`. No se adivina,
 * no se asigna por omisión, no se deja NULL — se escala a Wilvardo.
 * Prohibido replicar el `COALESCE(..., 1)` de `1784316436879:19`.
 *
 * No se filtra `deleted_at` en el backfill: el `NOT NULL` aplica a toda la
 * tabla, incluidas las filas soft-deleted (mismo criterio que
 * `1785800000010_add_business_unit_id_to_proceeding_file_type_property_values.ts`).
 */
export default class extends BaseSchema {
  protected tableName = 'career_path_candidate_status_histories'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('career_path_candidate_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` h
         INNER JOIN \`career_path_candidates\` c ON c.career_path_candidate_id = h.career_path_candidate_id
         SET h.business_unit_id = c.business_unit_id
         WHERE h.business_unit_id IS NULL`
      )

      const [rows] = await db.rawQuery(
        `SELECT COUNT(*) AS orphan_count FROM \`${this.tableName}\` WHERE business_unit_id IS NULL`
      )
      const orphanRows = Array.isArray(rows) ? (rows as Array<{ orphan_count: number }>) : []
      const orphanCount = Number(orphanRows[0]?.orphan_count ?? 0)

      if (orphanCount > 0) {
        throw new Error(
          `${this.tableName}: ${orphanCount} registro(s) sin business_unit_id resoluble ` +
            'contra su propuesta padre (career_path_candidates) — escalar a Wilvardo antes de ' +
            'continuar. No se ejecutó el MODIFY NOT NULL.'
        )
      }

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`career_path_candidate_status_histories_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`career_path_candidate_status_histories_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(
        ['business_unit_id'],
        'career_path_candidate_status_histories_business_unit_id_foreign'
      )
      table.dropIndex(
        ['business_unit_id'],
        'career_path_candidate_status_histories_business_unit_id_index'
      )
      table.dropColumn('business_unit_id')
    })
  }
}
