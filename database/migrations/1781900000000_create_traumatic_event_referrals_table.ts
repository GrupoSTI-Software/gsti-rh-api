import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'traumatic_event_referrals'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('traumatic_event_referral_id').notNullable()

      /**
       * FKs con nombre corto explícito: los auto-generados por Knex superan el
       * límite de 64 caracteres de MySQL con prefijos largos de entidad.
       */
      table.integer('traumatic_event_report_id').unsigned().notNullable()

      table
        .enum('traumatic_event_referral_institution_type', [
          'imss',
          'company_doctor',
          'private_clinic',
          'other',
        ])
        .notNullable()

      table.string('traumatic_event_referral_institution_name', 150).notNullable()
      table.date('traumatic_event_referral_referred_at').notNullable()
      table.string('traumatic_event_referral_notes', 500).nullable()
      table.integer('traumatic_event_referral_captured_by_user_id').unsigned().notNullable()

      table.timestamp('traumatic_event_referral_created_at').notNullable()
      table.timestamp('traumatic_event_referral_updated_at').nullable()
      table.timestamp('traumatic_event_referral_deleted_at').nullable()

      table
        .foreign('traumatic_event_report_id', 'fk_tref_report_id')
        .references('traumatic_event_report_id')
        .inTable('traumatic_event_reports')
        .onDelete('RESTRICT')

      table
        .foreign('traumatic_event_referral_captured_by_user_id', 'fk_tref_captured_by_user_id')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table.index(['traumatic_event_report_id'], 'idx_tref_report_id')
      table.index(['traumatic_event_referral_referred_at'], 'idx_tref_referred_at')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
