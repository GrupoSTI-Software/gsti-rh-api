import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Cola de ordenes hacia el checador (spec ADMS 6.1 y 10).
 *
 * `device_command_wire_id` es el identificador que viaja al equipo y que este
 * devuelve en el acuse: por eso es UNIQUE global y no por dispositivo. El
 * payload puede llevar un template biometrico, asi que va cifrado.
 *
 * Nada expira (decision D4): `_expires_at` existe para una politica futura y
 * hoy siempre es NULL.
 */
export default class extends BaseSchema {
  protected tableName = 'device_commands'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('device_command_id').notNullable()
      table.bigInteger('device_command_wire_id').unsigned().notNullable()
      table
        .integer('access_point_id')
        .unsigned()
        .notNullable()
        .references('access_point_id')
        .inTable('access_points')
        .onDelete('RESTRICT')
      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')
      table.integer('employee_id').unsigned().nullable()
      table.integer('access_point_employee_id').unsigned().nullable()

      table.string('device_command_kind', 30).notNullable()
      table.text('device_command_payload', 'longtext').notNullable()
      table
        .enum('device_command_status', [
          'pending',
          'sent',
          'acked',
          'executed',
          'failed',
          'cancelled',
          'expired',
        ])
        .notNullable()
        .defaultTo('pending')
      table.tinyint('device_command_priority').unsigned().notNullable().defaultTo(9)
      table.integer('device_command_attempts').unsigned().notNullable().defaultTo(0)
      table.integer('device_command_max_attempts').unsigned().nullable()
      table.integer('device_command_return_code').nullable()
      table.text('device_command_return_raw').nullable()
      table.timestamp('device_command_sent_at').nullable()
      table.timestamp('device_command_acked_at').nullable()
      table.timestamp('device_command_executed_at').nullable()
      table.timestamp('device_command_failed_at').nullable()
      table.timestamp('device_command_cancelled_at').nullable()
      table.timestamp('device_command_expires_at').nullable()
      table.string('device_command_last_error', 255).nullable()
      table.string('device_command_execution_evidence', 50).nullable()
      table.json('device_command_counters_snapshot').nullable()
      table.string('device_command_correlation_key', 100).nullable()
      table.integer('device_command_requested_by_user_id').unsigned().nullable()
      table.integer('biometric_template_id').unsigned().nullable()
      table.integer('biometric_photo_publication_id').unsigned().nullable()

      table.timestamp('device_command_created_at').notNullable().defaultTo(this.now())
      table.timestamp('device_command_updated_at').nullable()

      table.unique(['device_command_wire_id'], 'uq_device_command_wire_id')
      // Despacho: el primer pendiente por prioridad en cada equipo.
      table.index(
        ['access_point_id', 'device_command_status', 'device_command_priority'],
        'idx_device_command_dispatch'
      )
      // Idempotencia del encolado por llave de correlacion.
      table.index(
        ['access_point_id', 'device_command_correlation_key', 'device_command_status'],
        'idx_device_command_correlation'
      )
      table.index(['business_unit_id', 'device_command_status'], 'idx_device_command_bu_status')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
