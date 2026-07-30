import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Tracking pieza por pieza de la siembra demo del onboarding
 * (USRH1785438246847): una fila por entidad creada, con snapshot de la
 * unidad de negocio. El borrado (USRH1785438246903) borra EXCLUSIVAMENTE
 * lo registrado aquí (más lo derivado del empleado/usuario demo), validando
 * el snapshot fila a fila — nunca por heurísticas de nombres.
 *
 * Sin soft delete: las filas se borran (hard) en la misma transacción en que
 * se borra su entidad. `entity_id` no lleva FK física porque apunta a N
 * tablas distintas y debe sobrevivir a borrados manuales de la entidad.
 */
export default class extends BaseSchema {
  protected tableName = 'onboarding_seeded_records'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('onboarding_seeded_record_id').notNullable()

      table
        .integer('onboarding_user_state_id')
        .unsigned()
        .notNullable()
        .references('onboarding_user_state_id')
        .inTable('onboarding_user_states')
        .onDelete('CASCADE')

      // Snapshot de la BU de la siembra (segunda condición de pertenencia
      // del borrado). Sin cascade: borrar una BU no debe borrar constancia.
      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')

      // Constante de aplicación (ver ONBOARDING_SEEDED_ENTITY_TYPES), no enum de BD.
      table.string('onboarding_seeded_record_entity_type', 60).notNullable()
      table.integer('onboarding_seeded_record_entity_id').unsigned().notNullable()

      table.timestamp('onboarding_seeded_record_created_at').notNullable()

      table.unique(
        [
          'onboarding_user_state_id',
          'onboarding_seeded_record_entity_type',
          'onboarding_seeded_record_entity_id',
        ],
        { indexName: 'onboarding_seeded_records_entity_unique' }
      )
      table.index(
        ['onboarding_seeded_record_entity_type', 'onboarding_seeded_record_entity_id'],
        'onboarding_seeded_records_entity_lookup'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
