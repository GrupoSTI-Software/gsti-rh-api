import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1785260163611 — el catálogo `employee_types` pasa a ser del sistema
 * (`business_unit_id` NULL), visible para todos los tenants vía mixin
 * `includeGlobal`.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_types'

  async up() {
    this.defer(async (db) => {
      // Cada tenant pudo copiar el catálogo con el mismo slug; antes de NULL global
      // conservamos una fila canónica por slug y reasignamos FKs de empleados.
      await db.rawQuery(
        `UPDATE \`employees\` AS \`e\`
         INNER JOIN \`${this.tableName}\` AS \`et\`
           ON \`e\`.\`employee_type_id\` = \`et\`.\`employee_type_id\`
         INNER JOIN (
           SELECT \`employee_type_slug\`, MIN(\`employee_type_id\`) AS \`canonical_id\`
           FROM \`${this.tableName}\`
           WHERE \`employee_type_slug\` IS NOT NULL
             AND \`employee_type_deleted_at\` IS NULL
           GROUP BY \`employee_type_slug\`
           HAVING COUNT(*) > 1
         ) AS \`canon\` ON \`et\`.\`employee_type_slug\` = \`canon\`.\`employee_type_slug\`
         SET \`e\`.\`employee_type_id\` = \`canon\`.\`canonical_id\`
         WHERE \`et\`.\`employee_type_id\` <> \`canon\`.\`canonical_id\``
      )

      await db.rawQuery(
        `UPDATE \`${this.tableName}\` AS \`et\`
         INNER JOIN (
           SELECT \`employee_type_slug\`, MIN(\`employee_type_id\`) AS \`canonical_id\`
           FROM \`${this.tableName}\`
           WHERE \`employee_type_slug\` IS NOT NULL
             AND \`employee_type_deleted_at\` IS NULL
           GROUP BY \`employee_type_slug\`
           HAVING COUNT(*) > 1
         ) AS \`canon\` ON \`et\`.\`employee_type_slug\` = \`canon\`.\`employee_type_slug\`
         SET \`et\`.\`employee_type_deleted_at\` = NOW()
         WHERE \`et\`.\`employee_type_id\` <> \`canon\`.\`canonical_id\`
           AND \`et\`.\`employee_type_deleted_at\` IS NULL`
      )

      const duplicateSlugs = await db.rawQuery(
        `SELECT \`employee_type_slug\`, COUNT(*) AS total
         FROM \`${this.tableName}\`
         WHERE \`employee_type_slug\` IS NOT NULL
           AND \`employee_type_deleted_at\` IS NULL
         GROUP BY \`employee_type_slug\`
         HAVING COUNT(*) > 1`
      )

      const duplicateRows = Array.isArray(duplicateSlugs[0])
        ? (duplicateSlugs[0] as Array<{ employee_type_slug: string; total: number }>)
        : []

      if (duplicateRows.length > 0) {
        const slugs = duplicateRows.map((row) => row.employee_type_slug).join(', ')
        throw new Error(
          `employee_types: slugs duplicados tras deduplicar el catálogo (${slugs}) — escalar antes de migrar`
        )
      }

      await db.rawQuery(`UPDATE \`${this.tableName}\` SET \`business_unit_id\` = NULL`)

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NULL DEFAULT NULL`
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\`
         SET \`business_unit_id\` = 1
         WHERE \`business_unit_id\` IS NULL`
      )

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NULL DEFAULT 1`
      )
    })
  }
}
