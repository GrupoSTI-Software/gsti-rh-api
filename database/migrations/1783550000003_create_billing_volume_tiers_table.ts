import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'billing_volume_tiers'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('billing_volume_tier_id').unsigned().primary()
      table
        .bigInteger('billing_plan_id')
        .unsigned()
        .notNullable()
        .references('billing_plan_id')
        .inTable('billing_plans')
        .onDelete('RESTRICT')
      table.integer('billing_volume_tier_min_employees').unsigned().notNullable().comment('Mínimo de empleados (≥ 1); corte inclusivo')
      table.decimal('billing_volume_tier_discount_percent', 5, 2).notNullable().comment('Porcentaje de descuento [0, 100]')
      table.timestamps(true, true)
      table.timestamp('billing_volume_tier_deleted_at').nullable()

      table.unique(['billing_plan_id', 'billing_volume_tier_min_employees'], 'uq_billing_volume_tier_min_employees')
      table.index(['billing_plan_id', 'billing_volume_tier_min_employees'], 'idx_billing_volume_tier_min_employees')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
