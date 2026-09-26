import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1784259058521 — targets de cuestionario NOM-035: marca propia llaveada
 * a la APLICACIÓN, no al empleado.
 */
export default class extends BaseSchema {
  protected tableName = 'questionnaire_application_targets'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('questionnaire_application_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         INNER JOIN \`questionnaire_applications\` qa
           ON qa.questionnaire_application_id = child.questionnaire_application_id
         SET child.business_unit_id = qa.business_unit_id
         WHERE child.business_unit_id IS NULL`
      )
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`questionnaire_application_targets_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`questionnaire_application_targets_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(
        ['business_unit_id'],
        'questionnaire_application_targets_business_unit_id_foreign'
      )
      table.dropIndex(
        ['business_unit_id'],
        'questionnaire_application_targets_business_unit_id_index'
      )
      table.dropColumn('business_unit_id')
    })
  }
}
