import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Cuarentena de series desconocidas (spec v2, 4.2 y 9.3). Tabla global: una serie
 * que nadie registro no tiene empresa. El canal solo hace upsert por serie; el
 * reclamo desde el Backoffice (rebanada 11) exige la serie completa tecleada.
 */
export default class extends BaseSchema {
  protected tableName = 'adms_quarantined_devices'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('adms_quarantined_device_id').notNullable()
      table.string('adms_quarantined_device_serial', 100).notNullable()
      table.timestamp('adms_quarantined_device_first_seen_at').notNullable()
      table.timestamp('adms_quarantined_device_last_seen_at').notNullable()
      table.string('adms_quarantined_device_last_ip', 45).notNullable()
      table.integer('adms_quarantined_device_hit_count').unsigned().notNullable().defaultTo(0)
      table.json('adms_quarantined_device_hints').nullable()
      table
        .enum('adms_quarantined_device_status', ['pending', 'claimed', 'dismissed', 'locked'])
        .notNullable()
        .defaultTo('pending')
      table.tinyint('adms_quarantined_device_failed_claims').unsigned().notNullable().defaultTo(0)
      table.integer('claimed_business_unit_id').unsigned().nullable()
      table.integer('claimed_access_point_id').unsigned().nullable()
      table.string('adms_quarantined_device_dismiss_reason', 255).nullable()
      table.integer('adms_quarantined_device_resolved_by_user_id').unsigned().nullable()
      table.timestamp('adms_quarantined_device_resolved_at').nullable()

      table.timestamp('adms_quarantined_device_created_at').notNullable().defaultTo(this.now())
      table.timestamp('adms_quarantined_device_updated_at').nullable()

      table.unique(['adms_quarantined_device_serial'], 'uq_adms_quarantined_device_serial')
      table.index(
        ['adms_quarantined_device_status', 'adms_quarantined_device_last_seen_at'],
        'idx_adms_quarantine_status_seen'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
