import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'business_unit_users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('business_unit_user_id').notNullable()

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')

      table.integer('user_id').unsigned().notNullable().references('user_id').inTable('users')

      table.timestamp('business_unit_user_created_at').notNullable().defaultTo(this.now())
      table.timestamp('business_unit_user_updated_at').nullable()
      table.timestamp('business_unit_user_deleted_at').nullable()

      table.unique(['business_unit_id', 'user_id'], 'business_unit_users_business_unit_user_unique')
      table.index(['user_id'], 'business_unit_users_user_id_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
