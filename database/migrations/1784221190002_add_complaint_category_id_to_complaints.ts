import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Añade FK `complaint_category_id` en `complaints`, siembra el catálogo base
 * (idempotente) y backfill por slug desde la columna enum legada.
 */
export default class extends BaseSchema {
  protected tableName = 'complaints'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('complaint_category_id').unsigned().nullable()
    })

    this.defer(async (db) => {
      await db.rawQuery(`
        INSERT IGNORE INTO complaint_categories (
          complaint_category_slug,
          complaint_category_active,
          complaint_category_order,
          complaint_category_created_at,
          complaint_category_updated_at
        ) VALUES
          ('violencia-laboral', 1, 1, NOW(), NOW()),
          ('entorno', 1, 2, NOW(), NOW()),
          ('otro', 1, 3, NOW(), NOW())
      `)

      await db.rawQuery(`
        UPDATE complaints c
        INNER JOIN complaint_categories cc
          ON cc.complaint_category_slug = c.complaint_category
        SET c.complaint_category_id = cc.complaint_category_id
        WHERE c.complaint_category_id IS NULL
      `)

      await db.rawQuery(`
        ALTER TABLE complaints
          MODIFY COLUMN complaint_category_id INT UNSIGNED NOT NULL,
          ADD CONSTRAINT complaints_complaint_category_id_foreign
            FOREIGN KEY (complaint_category_id)
            REFERENCES complaint_categories (complaint_category_id)
            ON DELETE RESTRICT
      `)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['complaint_category_id'], 'complaints_complaint_category_id_foreign')
      table.dropColumn('complaint_category_id')
    })
  }
}
