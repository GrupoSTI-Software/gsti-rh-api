import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Defensa en profundidad (USRH1784259058555) — `position_certification_requirements`
 * (dato por-posición del cliente) sin marca de pertenencia propia. El
 * catálogo compartido `certifications` NO se toca aquí; solo esta tabla
 * puente por-posición.
 */
export default class extends BaseSchema {
  protected tableName = 'position_certification_requirements'

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
         ADD INDEX \`position_certification_requirements_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`position_certification_requirements_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(
        ['business_unit_id'],
        'position_certification_requirements_business_unit_id_foreign'
      )
      table.dropIndex(
        ['business_unit_id'],
        'position_certification_requirements_business_unit_id_index'
      )
      table.dropColumn('business_unit_id')
    })
  }
}
