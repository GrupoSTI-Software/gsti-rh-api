import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1784259058487 (ampliación) — valores de propiedades médicas heredan la
 * pertenencia de la condición del empleado (padre directo).
 */
export default class extends BaseSchema {
  protected tableName = 'medical_condition_type_property_values'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('employee_medical_condition_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         INNER JOIN \`employee_medical_conditions\` emc
           ON emc.employee_medical_condition_id = child.employee_medical_condition_id
         SET child.business_unit_id = emc.business_unit_id
         WHERE child.business_unit_id IS NULL`
      )
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`medical_condition_type_property_values_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`medical_condition_type_property_values_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(
        ['business_unit_id'],
        'medical_condition_type_property_values_business_unit_id_foreign'
      )
      table.dropIndex(
        ['business_unit_id'],
        'medical_condition_type_property_values_business_unit_id_index'
      )
      table.dropColumn('business_unit_id')
    })
  }
}
