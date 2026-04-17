import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'branch_offices'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('branch_office_id').notNullable()
      table.integer('business_unit_id').unsigned().notNullable()
      table
        .foreign('business_unit_id')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('CASCADE')
      table.string('branch_office_name', 255).notNullable()
      table.string('branch_office_slug', 255).notNullable()
      table.text('branch_office_location_address', 'longtext').nullable()
      table.integer('branch_office_ideal_template_count').unsigned().nullable()
      table.integer('branch_office_min_active_employees_per_shift').unsigned().nullable()
      table.timestamp('branch_office_created_at').notNullable()
      table.timestamp('branch_office_updated_at').nullable()
      table.timestamp('branch_office_deleted_at').nullable()
      table.index(['business_unit_id', 'branch_office_slug'], 'branch_offices_business_unit_slug_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
