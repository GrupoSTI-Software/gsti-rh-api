import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Boveda de biometricos del colaborador (spec ADMS 7.1 y 10).
 *
 * La serie del equipo NO entra en la llave a proposito: el mismo dedo
 * capturado en dos aparatos de la misma version de algoritmo es el mismo dato,
 * y meterla multiplicaria el biometrico de una persona por cada checador por
 * el que pase.
 *
 * `_major_ver` si entra, y su nulo cuenta como un valor mas: MySQL trata NULL
 * como distinto de NULL en un indice unico, asi que dos subidas sin version
 * conocida crean dos filas. Es lo que queremos: sin version no se puede
 * afirmar que sean el mismo dato.
 */
export default class extends BaseSchema {
  protected tableName = 'biometric_templates'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('biometric_template_id').notNullable()
      table.integer('employee_id').unsigned().notNullable()
      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table.tinyint('biometric_template_bio_type').unsigned().notNullable()
      table.tinyint('biometric_template_bio_no').unsigned().notNullable()
      table.tinyint('biometric_template_bio_index').unsigned().notNullable().defaultTo(0)
      table.tinyint('biometric_template_bio_format').unsigned().notNullable().defaultTo(0)
      table.string('biometric_template_major_ver', 10).nullable()
      table.string('biometric_template_minor_ver', 10).nullable()
      table.tinyint('biometric_template_valid').unsigned().notNullable().defaultTo(1)
      table.tinyint('biometric_template_duress').unsigned().notNullable().defaultTo(0)
      table.text('biometric_template_template', 'longtext').notNullable()
      table.integer('biometric_template_size').unsigned().notNullable()
      table.integer('source_access_point_id').unsigned().nullable()
      table.timestamp('biometric_template_captured_at').notNullable()

      table.timestamp('biometric_template_created_at').notNullable().defaultTo(this.now())
      table.timestamp('biometric_template_updated_at').nullable()

      table.unique(
        [
          'employee_id',
          'biometric_template_bio_type',
          'biometric_template_bio_no',
          'biometric_template_bio_index',
          'biometric_template_bio_format',
          'biometric_template_major_ver',
        ],
        'uq_biometric_template_identity'
      )
      table.index(
        ['employee_id', 'biometric_template_bio_type'],
        'idx_biometric_template_employee_type'
      )
      table.index(['business_unit_id'], 'idx_biometric_template_bu')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
