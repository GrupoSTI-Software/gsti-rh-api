import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Defensa en profundidad (USRH1784259058555) — `branch_office_shift_quotas`
 * sin marca de pertenencia propia. Su ruta ya monta `businessScope()` y su
 * servicio ya valida el padre en scope (404); el mixin refuerza sin romper
 * el `replace` (borrado duro en transacción). Sin borrado lógico: el
 * backfill cubre las filas vivas.
 */
export default class extends BaseSchema {
  protected tableName = 'branch_office_shift_quotas'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('branch_office_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         INNER JOIN \`branch_offices\` bo ON bo.branch_office_id = child.branch_office_id
         SET child.business_unit_id = bo.business_unit_id
         WHERE child.business_unit_id IS NULL`
      )

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`branch_office_shift_quotas_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`branch_office_shift_quotas_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(
        ['business_unit_id'],
        'branch_office_shift_quotas_business_unit_id_foreign'
      )
      table.dropIndex(['business_unit_id'], 'branch_office_shift_quotas_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
