import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'passkey_credentials'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('passkey_credential_id').primary()
      table
        .integer('user_id')
        .unsigned()
        .references('user_id')
        .inTable('users')
        .onDelete('CASCADE')
        .notNullable()
      table.string('passkey_credential_id_base64', 512).notNullable().unique()
      table.text('passkey_credential_public_key').notNullable()
      table.bigInteger('passkey_credential_counter').defaultTo(0).notNullable()
      table.string('passkey_credential_device_name', 255).nullable()
      table.json('passkey_credential_transports').nullable()
      table.string('passkey_credential_aaguid', 255).nullable()
      table.boolean('passkey_credential_backed_up').defaultTo(false)
      table.timestamp('passkey_credential_created_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('passkey_credential_last_used_at', { useTz: true }).nullable()
      table.timestamp('passkey_credential_updated_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('passkey_credential_deleted_at', { useTz: true }).nullable()

      // Índices para optimizar búsquedas
      table.index('user_id')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
