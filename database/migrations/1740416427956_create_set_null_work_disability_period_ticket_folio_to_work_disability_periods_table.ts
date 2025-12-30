import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'work_disability_periods'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('work_disability_period_ticket_folio').nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('work_disability_period_ticket_folio').notNullable().alter()
    })
  }
}
