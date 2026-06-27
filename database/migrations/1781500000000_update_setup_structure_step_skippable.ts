import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migración de datos: marca el paso `setup-structure` como omitible.
 *
 * El task ESB-07-04-01-03 especifica que el paso de estructura mínima
 * debe ser omitible para no bloquear el flujo del wizard.
 * El seeder original lo sembró con `is_skippable = false`; esta migración
 * lo corrige sin tocar el DDL de la tabla.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db
        .from('onboarding_steps')
        .where('onboarding_step_slug', 'setup-structure')
        .update({ onboarding_step_is_skippable: true })
    })
  }

  async down() {
    this.defer(async (db) => {
      await db
        .from('onboarding_steps')
        .where('onboarding_step_slug', 'setup-structure')
        .update({ onboarding_step_is_skippable: false })
    })
  }
}
