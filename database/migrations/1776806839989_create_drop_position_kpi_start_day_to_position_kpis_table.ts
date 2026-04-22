import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_kpis'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('position_kpi_start_day')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('position_kpi_start_day').nullable()
    })
  }
}
