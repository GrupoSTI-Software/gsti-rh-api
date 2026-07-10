import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Defensa en profundidad (ESB-07-08-03-08) — `department_position` (riesgo
 * Alto) es punto de entrada directo sin marca de pertenencia propia.
 *
 * Tiene dos padres (`department_id`, `position_id`) que en teoría podrían
 * divergir de BU (no hay constraint que los iguale a nivel BD, aunque
 * `OrgChartMoveService` sí exige coincidencia al mover/asignar). Se usa
 * `positions.business_unit_id` como fuente de verdad del backfill, en línea
 * con el resto de las tablas hijas de `position` en esta misma iniciativa.
 */
export default class extends BaseSchema {
  protected tableName = 'department_position'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('position_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` dp
         INNER JOIN \`positions\` p ON p.position_id = dp.position_id
         SET dp.business_unit_id = p.business_unit_id
         WHERE dp.business_unit_id IS NULL`
      )

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`department_position_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`department_position_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'department_position_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'department_position_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
