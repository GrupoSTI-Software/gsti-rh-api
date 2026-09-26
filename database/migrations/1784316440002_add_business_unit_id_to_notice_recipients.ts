import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1784316436823 — defensa en profundidad: marca de empresa en destinatarios.
 * Backfill desde el aviso padre (incluye huérfanos con employee_id NULL).
 */
export default class extends BaseSchema {
  protected tableName = 'notice_recipients'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('notice_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` nr
         INNER JOIN \`notices\` n ON n.notice_id = nr.notice_id
         SET nr.business_unit_id = n.business_unit_id
         WHERE nr.business_unit_id IS NULL
           AND n.business_unit_id IS NOT NULL`
      )

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         ADD INDEX \`notice_recipients_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`notice_recipients_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'notice_recipients_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'notice_recipients_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
