import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'onboarding_user_states'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('onboarding_user_state_id').notNullable()

      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('user_id')
        .inTable('users')
        .onDelete('CASCADE')

      // Intención elegida (null = no ha elegido aún)
      table
        .integer('onboarding_flow_id')
        .unsigned()
        .nullable()
        .references('onboarding_flow_id')
        .inTable('onboarding_flows')
        .onDelete('SET NULL')

      // Desnormalización del slug elegido para lectura rápida sin join
      table.string('onboarding_user_state_intent_slug', 100).nullable()

      table
        .enum('onboarding_user_state_status', ['pending', 'in_progress', 'completed', 'dismissed'])
        .notNullable()
        .defaultTo('pending')

      table.timestamp('started_at').nullable()
      table.timestamp('completed_at').nullable()

      table.timestamp('onboarding_user_state_created_at').notNullable()
      table.timestamp('onboarding_user_state_updated_at').nullable()

      // Un estado de onboarding por usuario
      table.unique(['user_id'], { indexName: 'onboarding_user_states_user_unique' })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
