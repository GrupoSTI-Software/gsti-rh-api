import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Respaldo crudo append-only de todo POST del canal ADMS (spec v2, 4.3 y 10).
 *
 * Se inserta ANTES de parsear y el acuse `OK: n` solo sale despues de que esta
 * fila existe. `business_unit_id` y `access_point_id` son NULL cuando la serie
 * no resolvio (cuarentena): esas filas nunca salen por una ruta de empresa.
 * El cuerpo se cifra en el modelo (puede llevar templates biometricos).
 */
export default class extends BaseSchema {
  protected tableName = 'adms_raw_messages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('adms_raw_message_id').notNullable()

      table
        .integer('access_point_id')
        .unsigned()
        .nullable()
        .references('access_point_id')
        .inTable('access_points')
        .onDelete('SET NULL')

      table.integer('business_unit_id').unsigned().nullable()

      table.string('adms_raw_message_serial', 100).notNullable()
      table.string('adms_raw_message_remote_ip', 45).notNullable()
      table.string('adms_raw_message_method', 8).notNullable()
      table.string('adms_raw_message_path', 255).notNullable()
      table.text('adms_raw_message_query').nullable()
      table.string('adms_raw_message_table', 50).nullable()
      table.string('adms_raw_message_stamp', 30).nullable()
      table.string('adms_raw_message_content_type', 100).nullable()
      table.text('adms_raw_message_body', 'longtext').notNullable()
      table.integer('adms_raw_message_body_bytes').unsigned().notNullable()
      table.integer('adms_raw_message_line_count').unsigned().notNullable().defaultTo(0)
      table
        .enum('adms_raw_message_status', ['received', 'processed', 'partial', 'unparsed', 'failed'])
        .notNullable()
        .defaultTo('received')
      table.string('adms_raw_message_ack', 50).nullable()
      table.text('adms_raw_message_error').nullable()
      table.timestamp('adms_raw_message_received_at').notNullable()
      table.timestamp('adms_raw_message_processed_at').nullable()

      table.timestamp('adms_raw_message_created_at').notNullable().defaultTo(this.now())
      table.timestamp('adms_raw_message_updated_at').nullable()

      table.index(['access_point_id', 'adms_raw_message_received_at'], 'idx_adms_raw_ap_received')
      table.index(
        ['adms_raw_message_serial', 'adms_raw_message_received_at'],
        'idx_adms_raw_serial_received'
      )
      table.index(['adms_raw_message_status'], 'idx_adms_raw_status')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
