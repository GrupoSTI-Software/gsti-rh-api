import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Defensa en profundidad (USRH1784259058533) — `user_responsible_employees`
 * (pivote usuario ↔ empleado) sin marca de pertenencia propia; la marca se
 * ancla en el empleado, no en el usuario responsable.
 */
export default class extends BaseSchema {
  protected tableName = 'user_responsible_employees'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('employee_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         INNER JOIN \`employees\` e ON e.employee_id = child.employee_id
         SET child.business_unit_id = e.business_unit_id
         WHERE child.business_unit_id IS NULL`
      )

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`user_responsible_employees_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`user_responsible_employees_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(
        ['business_unit_id'],
        'user_responsible_employees_business_unit_id_foreign'
      )
      table.dropIndex(['business_unit_id'], 'user_responsible_employees_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
