import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1784259058487 (ampliación) — propiedades del tipo médico heredan la
 * pertenencia del tipo padre.
 */
export default class extends BaseSchema {
  protected tableName = 'medical_condition_type_properties'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('medical_condition_type_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         INNER JOIN \`medical_condition_types\` t
           ON t.medical_condition_type_id = child.medical_condition_type_id
         SET child.business_unit_id = t.business_unit_id
         WHERE child.business_unit_id IS NULL`
      )
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`medical_condition_type_properties_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`medical_condition_type_properties_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(
        ['business_unit_id'],
        'medical_condition_type_properties_business_unit_id_foreign'
      )
      table.dropIndex(
        ['business_unit_id'],
        'medical_condition_type_properties_business_unit_id_index'
      )
      table.dropColumn('business_unit_id')
    })
  }
}
