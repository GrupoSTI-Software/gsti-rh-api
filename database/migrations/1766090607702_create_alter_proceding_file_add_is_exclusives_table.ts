import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'proceeding_file_types'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('proceeding_file_type_is_exclusive').notNullable().defaultTo(false).after('parent_id')
    })
  }

  async down() {
    const hasColumn = await this.schema.hasColumn(this.tableName, 'proceeding_file_type_is_exclusive')
    if (hasColumn) {
      this.schema.alterTable(this.tableName, (table) => {
        table.dropColumn('proceeding_file_type_is_exclusive')
      })
    }
  }
}
