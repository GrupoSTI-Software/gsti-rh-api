import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'branch_office_shift_quotas'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('branch_office_shift_quota_id').notNullable()
      table.integer('branch_office_id').unsigned().notNullable()
      table
        .foreign('branch_office_id')
        .references('branch_office_id')
        .inTable('branch_offices')
        .onDelete('CASCADE')
      table.integer('shift_id').unsigned().notNullable()
      table
        .foreign('shift_id')
        .references('shift_id')
        .inTable('shifts')
        .onDelete('RESTRICT')
      table
        .specificType('branch_office_shift_quota_required', 'smallint unsigned')
        .notNullable()
      table
        .specificType('branch_office_shift_quota_minimum', 'smallint unsigned')
        .notNullable()
      table.timestamp('branch_office_shift_quota_created_at').notNullable()
      table.timestamp('branch_office_shift_quota_updated_at').nullable()
      table.unique(['branch_office_id', 'shift_id'], 'branch_office_shift_quotas_branch_shift_unique')
      table.index(['shift_id'], 'branch_office_shift_quotas_shift_id_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
