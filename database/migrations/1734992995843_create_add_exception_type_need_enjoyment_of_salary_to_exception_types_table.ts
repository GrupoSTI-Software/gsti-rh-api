import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'exception_types'

  async up() {
    const col = 'exception_type_need_enjoyment_of_salary'
    const existing = await this.db.rawQuery(
      `SELECT COUNT(*) as count FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [this.tableName, col]
    )
    if (Number(existing[0]?.[0]?.count ?? 0) > 0) {
      return
    }

    this.schema.alterTable(this.tableName, (table) => {
      table.tinyint(col).after('exception_type_need_reason').nullable().defaultTo(0)
    })
  }

  async down() {
    const col = 'exception_type_need_enjoyment_of_salary'
    const existing = await this.db.rawQuery(
      `SELECT COUNT(*) as count FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [this.tableName, col]
    )
    if (Number(existing[0]?.[0]?.count ?? 0) === 0) {
      return
    }

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn(col)
    })
  }
}
