import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Plan elegido en el paso 1 del wizard de registro (USRH1785441820858).
 * Viaja en `POST /api/auth/signup/start` y se contrata al completar el registro.
 *
 * Nullable a propósito: borradores previos al despliegue no lo traen.
 * Sin FK a `billing_plans`: el borrador es efímero y el plan se revalida al completar.
 */
export default class extends BaseSchema {
  protected tableName = 'signup_drafts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .bigInteger('signup_draft_billing_plan_id')
        .unsigned()
        .nullable()
        .after('signup_draft_business_unit_name')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('signup_draft_billing_plan_id')
    })
  }
}
