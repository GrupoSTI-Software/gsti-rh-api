import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Marcas del ciclo de vida de la siembra demo (USRH1785438246847):
 * siembra activa := demo_seeded_at NOT NULL AND demo_cleaned_at NULL.
 * La BU de la siembra NO vive aquí: el ancla de tenant es el snapshot
 * por fila en onboarding_seeded_records.
 */
export default class extends BaseSchema {
  protected tableName = 'onboarding_user_states'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('onboarding_user_state_demo_seeded_at').nullable()
      table.timestamp('onboarding_user_state_demo_cleaned_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('onboarding_user_state_demo_seeded_at')
      table.dropColumn('onboarding_user_state_demo_cleaned_at')
    })
  }
}
