import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'proceeding_file_types'

  async up() {
    try {
      await this.db.rawQuery(
        `ALTER TABLE ${this.tableName} CHANGE COLUMN proceeding_file_is_exclusive proceeding_file_type_is_exclusive BOOLEAN NOT NULL DEFAULT FALSE`
      )
    } catch (error) {
      const columnExists = await this.db.rawQuery(
        `SELECT COUNT(*) as count FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = '${this.tableName}'
         AND COLUMN_NAME = 'proceeding_file_type_is_exclusive'`
      )

      if (!columnExists[0] || columnExists[0][0]?.count === 0) {
        this.schema.alterTable(this.tableName, (table) => {
          table.boolean('proceeding_file_type_is_exclusive').notNullable().defaultTo(false).after('parent_id')
        })
      }
    }
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('proceeding_file_type_is_exclusive')
    })
  }
}
