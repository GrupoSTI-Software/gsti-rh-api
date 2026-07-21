import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Retira la columna enum legada tras el backfill a FK.
 */
export default class extends BaseSchema {
  protected tableName = 'complaints'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('complaint_category')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('complaint_category', ['violencia-laboral', 'entorno', 'otro'])
        .nullable()
    })

    this.defer(async (db) => {
      await db.rawQuery(`
        UPDATE complaints c
        INNER JOIN complaint_categories cc
          ON cc.complaint_category_id = c.complaint_category_id
        SET c.complaint_category = cc.complaint_category_slug
        WHERE c.complaint_category IS NULL
      `)

      await db.rawQuery(`
        ALTER TABLE complaints
          MODIFY COLUMN complaint_category
            ENUM('violencia-laboral', 'entorno', 'otro') NOT NULL
      `)
    })
  }
}
