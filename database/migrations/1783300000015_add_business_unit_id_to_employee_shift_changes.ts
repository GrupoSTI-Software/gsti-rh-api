import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Defensa en profundidad (ESB-07-08-03-08) — `employee_shift_changes`
 * (riesgo Alto) es punto de entrada directo sin marca de pertenencia propia.
 *
 * Tiene DOS FKs a `employees` (`employee_id_from`, `employee_id_to`). Se usa
 * `employee_id_to` como fuente canónica de `business_unit_id` porque es la
 * relación que el modelo expone (`employeeTo`) y representa al empleado que
 * queda con el turno tras el cambio — de negocio, ambos deberían pertenecer
 * a la misma unidad; si llegaran a diferir, prevalece el destino.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_shift_changes'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('employee_id_to')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         INNER JOIN \`employees\` e ON e.employee_id = child.employee_id_to
         SET child.business_unit_id = e.business_unit_id
         WHERE child.business_unit_id IS NULL`
      )

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`employee_shift_changes_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`employee_shift_changes_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'employee_shift_changes_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'employee_shift_changes_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
