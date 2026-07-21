import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1784259058487 (ampliación) — tipos de condición médica son dato sensible
 * por cliente, no catálogo global. Backfill desde usos en employee_medical_conditions;
 * sin usos → primera unidad de negocio activa.
 */
export default class extends BaseSchema {
  protected tableName = 'medical_condition_types'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('medical_condition_type_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         INNER JOIN (
           SELECT medical_condition_type_id, MIN(business_unit_id) AS business_unit_id
           FROM \`employee_medical_conditions\`
           WHERE business_unit_id IS NOT NULL
           GROUP BY medical_condition_type_id
         ) emc ON emc.medical_condition_type_id = child.medical_condition_type_id
         SET child.business_unit_id = emc.business_unit_id
         WHERE child.business_unit_id IS NULL`
      )
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         SET child.business_unit_id = (
           SELECT MIN(business_unit_id) FROM \`business_units\`
         )
         WHERE child.business_unit_id IS NULL`
      )
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`medical_condition_types_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`medical_condition_types_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'medical_condition_types_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'medical_condition_types_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
