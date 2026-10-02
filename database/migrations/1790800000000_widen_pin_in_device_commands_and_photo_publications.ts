import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * El PIN del checador admite hasta 20 digitos (`BIO_PIN_PATTERN`) y las demas
 * tablas del canal ya lo guardan en 20. Estas dos quedaron en 9: un PIN largo
 * truncaba o rompia el encolado de la foto y de cualquier comando por PIN.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('device_commands', (table) => {
      table.string('device_command_pin', 20).nullable().alter()
    })
    this.schema.alterTable('biometric_photo_publications', (table) => {
      table.string('biometric_photo_publication_pin', 20).notNullable().alter()
    })
  }

  async down() {
    this.schema.alterTable('device_commands', (table) => {
      table.string('device_command_pin', 9).nullable().alter()
    })
    this.schema.alterTable('biometric_photo_publications', (table) => {
      table.string('biometric_photo_publication_pin', 9).notNullable().alter()
    })
  }
}
