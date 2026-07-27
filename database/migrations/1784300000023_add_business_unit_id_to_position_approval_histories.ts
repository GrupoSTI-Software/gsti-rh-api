import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Defensa en profundidad (USRH1784259058555) — `position_approval_histories`
 * (hijo de posición) sin marca de pertenencia propia; hoy solo queda
 * protegida si la consulta pasa primero por la ficha de la posición.
 *
 * `position_id` es NULLABLE en esta tabla. Decisión tomada (Wilvardo,
 * 2026-07-16): los huérfanos (position_id NULL) se eliminan, con su conteo
 * registrado en el log, antes de imponer NOT NULL — un historial de
 * aprobaciones sin posición no es rastreable.
 */
export default class extends BaseSchema {
  protected tableName = 'position_approval_histories'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('position_id')
    })

    this.defer(async (db) => {
      // 1) Contar y eliminar huérfanos (position_id NULL) — decisión Wilvardo 2026-07-16.
      const orphanRows = await db.rawQuery(
        `SELECT COUNT(*) AS orphans FROM \`${this.tableName}\` WHERE \`position_id\` IS NULL`
      )
      const orphanCount = Number(orphanRows?.[0]?.[0]?.orphans ?? 0)
      console.warn(
        `[USRH1784259058555] ${this.tableName} huérfanos eliminados (position_id NULL): ${orphanCount}`
      )
      await db.rawQuery(`DELETE FROM \`${this.tableName}\` WHERE \`position_id\` IS NULL`)

      // 2) Backfill desde el padre positions.
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         INNER JOIN \`positions\` p ON p.position_id = child.position_id
         SET child.business_unit_id = p.business_unit_id
         WHERE child.business_unit_id IS NULL`
      )

      // 3a) position_id pasa a NOT NULL tras limpiar huérfanos. MySQL no
      // permite combinar el MODIFY de una columna con FK propia junto con el
      // ADD INDEX/CONSTRAINT de otra columna en el mismo ALTER TABLE
      // ("Cannot change column ...: used in a foreign key constraint") —
      // se separa en dos sentencias.
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`position_id\` INT UNSIGNED NOT NULL`
      )

      // 3b) NOT NULL + index + FK para business_unit_id.
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`position_approval_histories_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`position_approval_histories_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(
        ['business_unit_id'],
        'position_approval_histories_business_unit_id_foreign'
      )
      table.dropIndex(['business_unit_id'], 'position_approval_histories_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
    // Nota: no revertimos position_id a NULLABLE ni restauramos las filas
    // huérfanas eliminadas — el down() de este patrón nunca reconstruye
    // datos borrados, solo la columna de aislamiento que agregó el up().
  }
}
