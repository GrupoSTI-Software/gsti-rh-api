import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Checadas que llegaron bien pero no se pudieron atribuir (spec v2, 9.4).
 * No se pierden ni se rechazan: quedan aqui con su motivo hasta que alguien
 * concilie el PIN o reactive al colaborador.
 *
 * La UNIQUE por (dispositivo, PIN, instante) hace que el reenvio del equipo
 * no multiplique la misma retencion.
 */
export default class extends BaseSchema {
  protected tableName = 'adms_held_punches'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('adms_held_punch_id').notNullable()
      table
        .integer('adms_unmapped_pin_id')
        .unsigned()
        .nullable()
        .references('adms_unmapped_pin_id')
        .inTable('adms_unmapped_pins')
        .onDelete('SET NULL')
      table
        .integer('access_point_id')
        .unsigned()
        .notNullable()
        .references('access_point_id')
        .inTable('access_points')
        .onDelete('CASCADE')
      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table.string('adms_held_punch_pin', 20).notNullable()
      table.datetime('adms_held_punch_punch_time_local').notNullable()
      table.datetime('adms_held_punch_punch_time_utc').notNullable()
      table.tinyint('adms_held_punch_verify').unsigned().nullable()
      table.integer('adms_raw_message_id').unsigned().nullable()
      table
        .enum('adms_held_punch_reason', [
          'unknown_pin',
          'employee_terminated',
          'ambiguous_code',
          'pin_quarantined',
          'ingestion_rejected',
        ])
        .notNullable()
      table
        .enum('adms_held_punch_status', ['held', 'attributed', 'discarded'])
        .notNullable()
        .defaultTo('held')
      table.integer('assist_id').unsigned().nullable()
      table.timestamp('adms_held_punch_attributed_at').nullable()

      table.timestamp('adms_held_punch_created_at').notNullable().defaultTo(this.now())
      table.timestamp('adms_held_punch_updated_at').nullable()

      table.unique(
        ['access_point_id', 'adms_held_punch_pin', 'adms_held_punch_punch_time_utc'],
        'uq_adms_held_punch_identity'
      )
      table.index(
        ['business_unit_id', 'adms_held_punch_status'],
        'idx_adms_held_punch_bu_status'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
