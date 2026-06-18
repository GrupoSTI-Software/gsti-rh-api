import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'onboarding_steps'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('onboarding_step_id').notNullable()

      // NULL = paso común (aplica a todos); FK a flujo = paso de rama
      table
        .integer('onboarding_flow_id')
        .unsigned()
        .nullable()
        .references('onboarding_flow_id')
        .inTable('onboarding_flows')
        .onDelete('SET NULL')

      table.string('onboarding_step_slug', 100).notNullable()
      table.string('onboarding_step_name', 255).notNullable()
      table.text('onboarding_step_description').nullable()
      table.tinyint('onboarding_step_order').unsigned().notNullable().defaultTo(1)

      // Si false, el endpoint /skip rechaza el paso con 409
      table.boolean('onboarding_step_is_skippable').notNullable().defaultTo(true)

      // Señal informativa para que el consumidor detecte si el paso ya se cumplió;
      // el motor no evalúa esta columna.
      table.string('onboarding_step_completion_hint', 255).nullable()
      table.boolean('onboarding_step_active').notNullable().defaultTo(true)

      table.timestamp('onboarding_step_created_at').notNullable()
      table.timestamp('onboarding_step_updated_at').nullable()
      table.timestamp('onboarding_step_deleted_at').nullable()

      table.unique(['onboarding_step_slug'], { indexName: 'onboarding_steps_slug_unique' })

      // Índice para componer la secuencia por flujo y orden
      table.index(
        ['onboarding_flow_id', 'onboarding_step_order'],
        'onboarding_steps_flow_order_index'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
