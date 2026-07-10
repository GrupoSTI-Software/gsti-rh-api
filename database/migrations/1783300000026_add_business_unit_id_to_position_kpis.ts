import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Defensa en profundidad (ESB-07-08-03-08) — `position_kpis` (riesgo Alto)
 * es punto de entrada directo sin marca de pertenencia propia.
 */
export default class extends BaseSchema {
  protected tableName = 'position_kpis'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('position_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         INNER JOIN \`positions\` p ON p.position_id = child.position_id
         SET child.business_unit_id = p.business_unit_id
         WHERE child.business_unit_id IS NULL`
      )

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`position_kpis_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`position_kpis_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'position_kpis_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'position_kpis_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
