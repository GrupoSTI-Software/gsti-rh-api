import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'billing_plans'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('billing_plan_id').unsigned().primary()
      table.string('billing_plan_name', 120).notNullable()
      table.string('billing_plan_description', 255).nullable()
      table.string('billing_plan_provider', 20).notNullable().defaultTo('manual')
      table.string('billing_plan_stripe_product_id', 120).nullable()
      table.tinyint('billing_plan_active').notNullable().defaultTo(1)
      table.timestamp('billing_plan_published_at').nullable().comment('NULL = borrador; estampa la publicación (irreversible)')
      table.timestamps(true, true)
      table.timestamp('billing_plan_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
