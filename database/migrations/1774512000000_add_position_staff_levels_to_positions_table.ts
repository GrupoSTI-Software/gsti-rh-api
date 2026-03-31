import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'positions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('position_min_staff')
        .unsigned()
        .after('position_profile_expiration_date')
        .nullable()
      table.integer('position_ideal_staff').unsigned().nullable()
      table.integer('position_max_staff').unsigned().nullable()
      table.integer('position_min_active_staff_per_shift').unsigned().nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('position_min_staff')
      table.dropColumn('position_ideal_staff')
      table.dropColumn('position_max_staff')
      table.dropColumn('position_min_active_staff_per_shift')
    })
  }
}
