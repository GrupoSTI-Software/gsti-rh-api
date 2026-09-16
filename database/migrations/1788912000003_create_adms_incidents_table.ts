import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Incidentes del canal ADMS (spec v2, 10): layout desconocido, serie inactiva,
 * anomalia de IP, dialecto CA, tabla desconocida, cuerpo excedido, etc.
 *
 * `business_unit_id` NULL = incidente global (serie desconocida, sondeo): solo lo
 * ve plataforma. `_context` es JSON por lista blanca, sin PII ni templates.
 */
export default class extends BaseSchema {
  protected tableName = 'adms_incidents'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('adms_incident_id').notNullable()

      table
        .integer('access_point_id')
        .unsigned()
        .nullable()
        .references('access_point_id')
        .inTable('access_points')
        .onDelete('SET NULL')
      table.integer('business_unit_id').unsigned().nullable()
      table.integer('adms_raw_message_id').unsigned().nullable()
      table.integer('device_command_id').unsigned().nullable()

      table.string('adms_incident_kind', 50).notNullable()
      table.enum('adms_incident_severity', ['info', 'warning', 'error']).notNullable()
      table.string('adms_incident_code', 30).notNullable()
      table.string('adms_incident_title', 200).notNullable()
      table.text('adms_incident_detail').notNullable()
      table.string('adms_incident_key', 200).notNullable()
      table.json('adms_incident_context').nullable()
      table.enum('adms_incident_status', ['open', 'resolved']).notNullable().defaultTo('open')
      table.timestamp('adms_incident_resolved_at').nullable()
      table.integer('adms_incident_resolved_by_user_id').unsigned().nullable()

      table.timestamp('adms_incident_created_at').notNullable().defaultTo(this.now())
      table.timestamp('adms_incident_updated_at').nullable()

      table.index(['access_point_id', 'adms_incident_status'], 'idx_adms_incident_ap_status')
      table.index(['adms_incident_kind', 'adms_incident_created_at'], 'idx_adms_incident_kind')
      table.index(['business_unit_id', 'adms_incident_status'], 'idx_adms_incident_bu_status')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
