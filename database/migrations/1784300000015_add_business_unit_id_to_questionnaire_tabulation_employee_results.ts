import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1784259058521 — resultados de tabulación por empleado NOM-035: marca
 * propia llaveada a la APLICACIÓN, coherente con cómo el motor de
 * tabulación ya llavea el resultado agregado.
 */
export default class extends BaseSchema {
  protected tableName = 'questionnaire_tabulation_employee_results'

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
      // Nombres abreviados (convención `qter` ya usada en la tabla, ver
      // 1782500000004_create_...): el nombre completo excede el límite de
      // 64 caracteres de MySQL para identificadores.
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`idx_qter_business_unit_id\` (\`business_unit_id\`),
         ADD CONSTRAINT \`fk_qter_business_unit_id\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'fk_qter_business_unit_id')
      table.dropIndex(['business_unit_id'], 'idx_qter_business_unit_id')
      table.dropColumn('business_unit_id')
    })
  }
}
