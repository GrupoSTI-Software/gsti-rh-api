import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1784259058498 — notas de incapacidad: marca propia con backfill de 2 saltos
 * (nota → incapacidad → empleado). No filtrar padres soft-deleted.
 */
export default class extends BaseSchema {
  protected tableName = 'work_disability_notes'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('work_disability_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         INNER JOIN \`work_disabilities\` wd ON wd.work_disability_id = child.work_disability_id
         INNER JOIN \`employees\` e ON e.employee_id = wd.employee_id
         SET child.business_unit_id = e.business_unit_id
         WHERE child.business_unit_id IS NULL`
      )
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`work_disability_notes_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`work_disability_notes_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'work_disability_notes_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'work_disability_notes_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
