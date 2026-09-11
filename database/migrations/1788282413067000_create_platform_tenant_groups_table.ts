import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Grupos económicos de tenants (USRH1788052455657).
 * Tabla global sin `business_unit_id` ni mixin de scope: el grupo es dato de GSTI, no de tenant.
 * La unicidad del nombre entre grupos vivos vive en columna generada + UNIQUE, nunca UNIQUE plano.
 */
export default class extends BaseSchema {
  protected tableName = 'platform_tenant_groups'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('platform_tenant_group_id').notNullable()
      table.string('platform_tenant_group_name', 150).notNullable()
      table.tinyint('platform_tenant_group_active').notNullable().defaultTo(1)
      table.timestamp('platform_tenant_group_created_at').notNullable().defaultTo(this.now())
      table.timestamp('platform_tenant_group_updated_at').nullable()
      table.timestamp('platform_tenant_group_deleted_at').nullable().defaultTo(null)
    })

    // Columna generada VIRTUAL: nombre real en vivos, NULL en dados de baja.
    this.schema.raw(`
      ALTER TABLE \`platform_tenant_groups\`
      ADD COLUMN \`platform_tenant_group_name_active\` VARCHAR(150)
        GENERATED ALWAYS AS (
          CASE WHEN \`platform_tenant_group_deleted_at\` IS NULL
               THEN \`platform_tenant_group_name\` ELSE NULL END
        ) VIRTUAL
    `)

    // Cada NULL se considera distinto: las bajas no compiten por el nombre (regla 3).
    this.schema.raw(`
      ALTER TABLE \`platform_tenant_groups\`
      ADD UNIQUE KEY \`platform_tenant_groups_name_active_unique\` (\`platform_tenant_group_name_active\`)
    `)
  }

  async down() {
    // Tolerante a estado parcial: verifica information_schema antes de cada DROP.
    this.defer(async (db) => {
      type CountRow = { cnt: number }
      const [idxRows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
         WHERE table_schema = DATABASE()
           AND table_name = 'platform_tenant_groups'
           AND index_name = 'platform_tenant_groups_name_active_unique'`
      )
      if ((idxRows[0]?.cnt ?? 0) > 0) {
        await db.rawQuery(
          'ALTER TABLE `platform_tenant_groups` DROP INDEX `platform_tenant_groups_name_active_unique`'
        )
      }
      const [colRows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE table_schema = DATABASE()
           AND table_name = 'platform_tenant_groups'
           AND column_name = 'platform_tenant_group_name_active'`
      )
      if ((colRows[0]?.cnt ?? 0) > 0) {
        await db.rawQuery(
          'ALTER TABLE `platform_tenant_groups` DROP COLUMN `platform_tenant_group_name_active`'
        )
      }
    })
    this.schema.dropTableIfExists(this.tableName)
  }
}
