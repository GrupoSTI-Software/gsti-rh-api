import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Biometricos que llegaron de un PIN sin dueno (spec ADMS 9.4).
 *
 * No se descartan: el equipo ya capturo el dedo de una persona real y volver a
 * pedirselo cuesta una visita. Esperan aqui a que alguien concilie el PIN, y
 * entonces se trasladan a la boveda.
 */
export default class extends BaseSchema {
  protected tableName = 'adms_held_biometrics'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('adms_held_biometric_id').notNullable()
      table
        .integer('adms_unmapped_pin_id')
        .unsigned()
        .nullable()
        .references('adms_unmapped_pin_id')
        .inTable('adms_unmapped_pins')
        .onDelete('CASCADE')
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

      table.string('adms_held_biometric_pin', 20).notNullable()
      table.tinyint('adms_held_biometric_bio_type').unsigned().notNullable()
      table.tinyint('adms_held_biometric_bio_no').unsigned().notNullable()
      table.string('adms_held_biometric_major_ver', 10).nullable()
      table.string('adms_held_biometric_minor_ver', 10).nullable()
      table.text('adms_held_biometric_template', 'longtext').notNullable()
      table.integer('adms_held_biometric_size').unsigned().notNullable()
      table
        .enum('adms_held_biometric_status', ['held', 'attributed', 'discarded'])
        .notNullable()
        .defaultTo('held')
      table.integer('biometric_template_id').unsigned().nullable()

      table.timestamp('adms_held_biometric_created_at').notNullable().defaultTo(this.now())
      table.timestamp('adms_held_biometric_updated_at').nullable()

      table.unique(
        [
          'access_point_id',
          'adms_held_biometric_pin',
          'adms_held_biometric_bio_type',
          'adms_held_biometric_bio_no',
        ],
        'uq_adms_held_biometric_identity'
      )
      table.index(
        ['business_unit_id', 'adms_held_biometric_status'],
        'idx_adms_held_biometric_bu_status'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
