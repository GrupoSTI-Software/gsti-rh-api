import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Ajuste de cobro de toda la plataforma (VLRH-H1791939650950).
 *
 * Append-only: una fila por cambio; la vigente es la de mayor id. Sin
 * `business_unit_id` ni mixin (dato de plataforma) y sin `updated_at` ni
 * `deleted_at`: nadie edita ni borra filas. Sin filas rige el default de
 * `app/helpers/contracted_employees_rules.ts`.
 */
export default class extends BaseSchema {
  protected tableName = 'platform_billing_settings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('platform_billing_setting_id').notNullable()
      table.tinyint('platform_billing_setting_grace_days').unsigned().notNullable()
      table.boolean('platform_billing_setting_restriction_enabled').notNullable().defaultTo(false)
      table.date('platform_billing_setting_restriction_enabled_on').nullable()
      table
        .integer('platform_billing_setting_created_by_user_id')
        .unsigned()
        .notNullable()
      table
        .foreign('platform_billing_setting_created_by_user_id', 'fk_pbs_created_by_user_id')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')
        table.timestamp('platform_billing_setting_created_at').notNullable().defaultTo(this.now())
    })
    
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}