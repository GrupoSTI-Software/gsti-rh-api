import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateBillingSubscriptionsTable extends BaseSchema {
  protected tableName = 'billing_subscriptions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('billing_subscription_id').unsigned().primary()

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      // Referencias de origen del trato (de dónde salió la foto). NO son fuente
      // de verdad del cobro: lo que se cobra vive congelado en las columnas de abajo.
      table
        .bigInteger('billing_plan_id')
        .unsigned()
        .notNullable()
        .references('billing_plan_id')
        .inTable('billing_plans')
        .onDelete('RESTRICT')

      table
        .bigInteger('billing_plan_price_id')
        .unsigned()
        .notNullable()
        .references('billing_plan_price_id')
        .inTable('billing_plan_prices')
        .onDelete('RESTRICT')

      table.string('billing_subscription_provider', 20).notNullable().defaultTo('manual')
      table
        .enum('billing_subscription_status', ['trialing', 'active', 'past_due', 'canceled'])
        .notNullable()
        .defaultTo('trialing')

      // ─── Foto del trato (congelada al contratar vía resolvePrice; write-once) ─
      // Nota: el catálogo (billing_plan_prices.billing_plan_price_amount) usa
      // decimal en pesos, no centavos; se respeta esa convención aquí (spec §9,
      // nota de verificación: "alinear a la convención real del catálogo").
      table.decimal('billing_subscription_contracted_unit_amount', 10, 2).notNullable()
      table.integer('billing_subscription_contracted_employees').unsigned().notNullable()
      table.decimal('billing_subscription_discount_percent', 5, 2).notNullable().defaultTo(0)
      table.integer('billing_subscription_contracted_trial_days').unsigned().notNullable().defaultTo(0)
      table.string('billing_subscription_contracted_currency', 3).notNullable().defaultTo('MXN')
      table.decimal('billing_subscription_contracted_tax_rate', 5, 4).notNullable().defaultTo(0.16)
      table.decimal('billing_subscription_contracted_subtotal', 12, 2).notNullable()
      table.decimal('billing_subscription_contracted_tax_amount', 12, 2).notNullable()
      table.decimal('billing_subscription_contracted_total', 12, 2).notNullable()
      table.date('billing_subscription_contracted_effective_from').notNullable()

      // ─── Reloj (se inicializa aquí; lo mueve la pieza hermana del reloj/pagos) ─
      table.timestamp('billing_subscription_trial_ends_at').nullable()
      table.timestamp('billing_subscription_current_period_start').nullable()
      table.timestamp('billing_subscription_current_period_end').nullable()

      // ─── Proveedor de cobro (provider-agnostic; Stripe reconcilia después) ─
      table.string('billing_subscription_stripe_customer_id', 191).nullable()
      table.string('billing_subscription_stripe_subscription_id', 191).nullable()

      // ─── Ciclo ──────────────────────────────────────────────────────────────
      table.timestamp('billing_subscription_subscribed_at').notNullable()
      table.timestamp('billing_subscription_canceled_at').nullable()

      // ─── Candado de unicidad "una sola viva por empresa" (patrón MySQL: no hay
      // UNIQUE parcial/WHERE). Espejo de business_unit_id mientras está viva;
      // NULL al cancelar. Se refuerza con SELECT ... FOR UPDATE en el service. ─
      table.integer('billing_subscription_live_business_unit_id').unsigned().nullable()

      table.timestamps(true, true)
      table.timestamp('billing_subscription_deleted_at').nullable()

      table.unique(['billing_subscription_live_business_unit_id'], 'uq_billing_subscription_live_business_unit')
      table.index(['business_unit_id', 'billing_subscription_status'], 'idx_billing_subscription_live_lookup')
      table.index(['billing_subscription_current_period_end'], 'idx_billing_subscription_period_end')
      table.index(['billing_subscription_trial_ends_at'], 'idx_billing_subscription_trial_ends_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
