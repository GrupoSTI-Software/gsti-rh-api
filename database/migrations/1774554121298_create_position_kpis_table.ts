import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_kpis'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('position_kpi_id')

      table.integer('position_id').unsigned().references('positions.position_id')

      table.text('position_kpi_name').notNullable()
      table.integer('position_kpi_min').nullable()
      table.integer('position_kpi_max').nullable()

      table.string('position_kpi_ideal').notNullable()

      table.enum('position_kpi_scale', ['mayor es mejor', 'menor es mejor', 'si', 'no']).notNullable()
      table.enum('position_kpi_type', ['numérico', 'porcentaje', 'dinero', 'booleano']).notNullable()
     
      table.enum('position_kpi_frequency', ['sin especificar','diario', 'semanal', 'cada 2 semanas', 'mensual', 'trimestral', 'semestral', 'anual']).notNullable()
      table.integer('position_kpi_duration_days').notNullable()
      table.integer('position_kpi_start_day').notNullable()

      table.timestamp('position_kpi_created_at').notNullable()
      table.timestamp('position_kpi_updated_at').nullable()
      table.timestamp('position_kpi_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}