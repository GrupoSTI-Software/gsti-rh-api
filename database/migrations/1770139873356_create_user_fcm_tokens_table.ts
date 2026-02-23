import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_fcm_tokens'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('user_fcm_token_id')
      table.integer('user_id').unsigned().notNullable()
      table.foreign('user_id').references('users.user_id')
      table.string('user_fcm_token', 255).notNullable().unique()
      table.tinyint('user_fcm_token_active').defaultTo(1).notNullable()
      table.string('user_fcm_token_platform', 255).notNullable()
      table.timestamp('user_fcm_token_last_seen_at').nullable()

      table.timestamp('user_fcm_token_created_at').notNullable()
      table.timestamp('user_fcm_token_updated_at').nullable()
      table.timestamp('user_fcm_token_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}