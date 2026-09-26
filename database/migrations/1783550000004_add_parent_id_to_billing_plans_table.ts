import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddParentIdToBillingPlansTable extends BaseSchema {
  protected tableName = 'billing_plans'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .bigInteger('billing_plan_parent_id')
        .unsigned()
        .nullable()
        .references('billing_plan_id')
        .inTable('billing_plans')
        .onDelete('SET NULL')
        .comment('Plan del que se clonó este plan (linaje). NULL = plan original.')

      table.index(['billing_plan_parent_id'], 'idx_billing_plan_parent_id')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['billing_plan_parent_id'], 'idx_billing_plan_parent_id')
      table.dropColumn('billing_plan_parent_id')
    })
  }
}
