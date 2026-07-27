import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Defensa en profundidad + cierre de fuga IDOR (USRH1784259058577) —
 * `shift_exceptions` sin marca de pertenencia propia; hoy el controlador
 * busca por PK y cualquier usuario autenticado puede leer/mutar la
 * excepción de otro cliente si conoce el id.
 *
 * `employee_id` es nullable (migración original `1718645678989`): antes
 * de exigir `business_unit_id NOT NULL` se cuenta y aborta si hay
 * huérfanos (espejo del guard de `1783300000030`). Pre-check al
 * implementar: 0 filas con `employee_id IS NULL` (~10.9k filas totales).
 */
export default class extends BaseSchema {
  protected tableName = 'shift_exceptions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('employee_id')
    })

    this.defer(async (db) => {
      // 1) Guard de huérfanos: employee_id es nullable; no forzar NOT NULL
      //    a ciegas → abortar y escalar el conteo (decisión de producto).
      const orphanRows = await db.rawQuery(
        `SELECT COUNT(*) AS orphans FROM \`${this.tableName}\` WHERE \`employee_id\` IS NULL`
      )
      const orphanCount = Number(orphanRows?.[0]?.[0]?.orphans ?? 0)

      if (orphanCount > 0) {
        throw new Error(
          `shift_exceptions: ${orphanCount} fila(s) con employee_id NULL. ` +
            'Escalar a producto antes de exigir business_unit_id NOT NULL (USRH1784259058577).'
        )
      }

      // 2) Backfill vía el empleado dueño (cubre soft-deleted: el UPDATE
      //    no filtra *_deleted_at del hijo).
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         INNER JOIN \`employees\` e ON e.employee_id = child.employee_id
         SET child.business_unit_id = e.business_unit_id
         WHERE child.business_unit_id IS NULL`
      )

      // 3) NOT NULL + index + FK.
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`shift_exceptions_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`shift_exceptions_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'shift_exceptions_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'shift_exceptions_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
