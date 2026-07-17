import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'billing_plan_prices'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('billing_plan_price_id').unsigned().primary()
      table
        .bigInteger('billing_plan_id')
        .unsigned()
        .notNullable()
        .references('billing_plan_id')
        .inTable('billing_plans')
        .onDelete('RESTRICT')
      table.decimal('billing_plan_price_amount', 10, 2).notNullable().comment('Monto por empleado/mes')
      table.specificType('billing_plan_price_currency', 'CHAR(3)').notNullable().defaultTo('MXN')
      table.decimal('billing_plan_price_tax_rate', 5, 4).notNullable().defaultTo(0.16)
      table.smallint('billing_plan_price_trial_days').unsigned().notNullable().defaultTo(7)
      table.date('billing_plan_price_effective_from').notNullable().defaultTo('2000-01-01').comment('Fecha de vigencia; MAX(effective_from ≤ hoy) = vigente')
      table.string('billing_plan_price_stripe_price_id', 120).nullable()
      table.string('billing_plan_price_provider', 20).notNullable().defaultTo('manual')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      // SIN updated_at · SIN deleted_at — append-only puro (inmutable)

      table.unique(['billing_plan_id', 'billing_plan_price_effective_from'], 'uq_billing_plan_price_effective_from')
      table.index(['billing_plan_id', 'billing_plan_price_effective_from'], 'idx_billing_plan_price_effective_from')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
