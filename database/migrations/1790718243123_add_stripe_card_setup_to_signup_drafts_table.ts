import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1790718243123 — cliente Stripe y SetupIntent del registro en curso.
 * El contador de intento y el reclamo los escribe USRH1790708507607.
 */
export default class extends BaseSchema {
  protected tableName = 'signup_drafts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('signup_draft_stripe_customer_id', 191)
        .nullable()
        .defaultTo(null)
        .after('signup_draft_token')
      table
        .string('signup_draft_stripe_setup_intent_id', 191)
        .nullable()
        .defaultTo(null)
        .after('signup_draft_stripe_customer_id')
      table
        .integer('signup_draft_stripe_subscription_attempt')
        .unsigned()
        .notNullable()
        .defaultTo(0)
        .after('signup_draft_stripe_setup_intent_id')
      table
        .timestamp('signup_draft_completion_claimed_at')
        .nullable()
        .defaultTo(null)
        .after('signup_draft_stripe_subscription_attempt')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('signup_draft_completion_claimed_at')
      table.dropColumn('signup_draft_stripe_subscription_attempt')
      table.dropColumn('signup_draft_stripe_setup_intent_id')
      table.dropColumn('signup_draft_stripe_customer_id')
    })
  }
}
