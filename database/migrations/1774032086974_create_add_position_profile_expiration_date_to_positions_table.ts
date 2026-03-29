import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'positions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .timestamp('position_profile_expiration_date')
        .after('position_last_synchronization_at')
        .nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('position_profile_expiration_date')
    })
  }
}

