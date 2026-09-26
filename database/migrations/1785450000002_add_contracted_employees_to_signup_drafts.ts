import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Cantidad de empleados declarada en el paso 1 del registro (USRH1785441820858).
 * Viaja en `POST /api/auth/signup/start` y se contrata al completar el registro.
 *
 * Nullable a propósito: borradores previos al despliegue no lo traen.
 */
export default class extends BaseSchema {
  protected tableName = 'signup_drafts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('signup_draft_contracted_employees')
        .unsigned()
        .nullable()
        .after('signup_draft_billing_plan_id')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('signup_draft_contracted_employees')
    })
  }
}
