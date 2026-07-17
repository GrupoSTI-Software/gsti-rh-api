import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Relación formal `system_settings` → `business_units` (USRH1783712837572).
 *
 * Hoy la configuración se liga a una empresa por texto (`system_setting_business_units`,
 * CSV de slugs). Esta migración agrega la relación formal por identificador para que
 * el alta self-service pueda crear la configuración del tenant nuevo ligada de forma
 * dura, sin depender de resolución por texto.
 *
 * Sin backfill (puras empresas nuevas, ver spec-USRH1783712837572.md §8): el registro
 * base `system_setting_id = 1` (siembra `0019_system_setting_seeder.ts`) no representa
 * un tenant real y queda con `business_unit_id` nulo. MySQL permite múltiples filas con
 * `NULL` en un índice UNIQUE, por lo que el registro base no colisiona con el UNIQUE.
 *
 * `UNIQUE(business_unit_id)` plano (sin `deleted_at`): un solo registro por empresa,
 * incluyendo filas soft-deleted. Espejo de la trampa documentada en
 * `1783000000001_create_work_journal_entries_table.ts:70-77` — incluir `deleted_at` en
 * el UNIQUE permitiría duplicados entre filas activas porque MySQL trata cada NULL como
 * distinto. La reprovisión de un tenant con configuración soft-deleted se resuelve
 * reviviendo la fila existente (`SystemSettingService.createForTenant`), no insertando una nueva.
 */
export default class extends BaseSchema {
  protected tableName = 'system_settings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('system_setting_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         ADD CONSTRAINT \`system_settings_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`),
         ADD UNIQUE INDEX \`system_settings_business_unit_id_unique\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'system_settings_business_unit_id_foreign')
      table.dropUnique(['business_unit_id'], 'system_settings_business_unit_id_unique')
      table.dropColumn('business_unit_id')
    })
  }
}
