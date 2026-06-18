import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'onboarding_user_step_progress'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('onboarding_user_step_progress_id').notNullable()

      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('user_id')
        .inTable('users')
        .onDelete('CASCADE')

      table
        .integer('onboarding_step_id')
        .unsigned()
        .notNullable()
        .references('onboarding_step_id')
        .inTable('onboarding_steps')
        .onDelete('CASCADE')

      table.enum('status', ['completed', 'skipped']).notNullable()
      table.timestamp('marked_at').notNullable()

      table.timestamp('onboarding_user_step_progress_created_at').notNullable()
      table.timestamp('onboarding_user_step_progress_updated_at').nullable()

      // Garantía de idempotencia: solo un registro de progreso por usuario y paso
      table.unique(['user_id', 'onboarding_step_id'], {
        indexName: 'onboarding_user_step_progress_user_step_unique',
      })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
