import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Elimina la tabla legada `labor_law_hours` (EPIC-08-12). La fuente única de verdad
 * del marco legal de jornada es `working_time_rules`; este catálogo global de un solo
 * valor ya no tiene consumidores tras migrar el Excel de asistencia al motor nuevo.
 *
 * `down()` recrea la tabla vacía con el schema original para que la migración sea
 * reversible (no re-siembra datos).
 */
export default class extends BaseSchema {
  protected tableName = 'labor_law_hours'

  async up() {
    this.schema.dropTable(this.tableName)
  }

  async down() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('labor_law_hours_id')
      table.decimal('labor_law_hours_hours_per_week', 5, 2).notNullable().defaultTo(48.0)
      table.tinyint('labor_law_hours_active').notNullable().defaultTo(1)
      table.date('labor_law_hours_apply_since').notNullable()
      table.text('labor_law_hours_description').nullable()

      table.timestamp('labor_law_hours_created_at').notNullable()
      table.timestamp('labor_law_hours_updated_at').notNullable()
      table.timestamp('labor_law_hours_deleted_at').nullable()
    })
  }
}
