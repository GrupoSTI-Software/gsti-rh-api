import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1786566437097 — M2: contenedor de la llave natural.
 * Columna nullable + UNIQUE; el histórico se rellena post-deploy con
 * `node ace backfill:assist-natural-key`. Sin UPDATE en esta migración.
 */
export default class extends BaseSchema {
  protected tableName = 'assists'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('assist_natural_key', 64).nullable()
      table.unique(['assist_natural_key'], { indexName: 'assists_natural_key_unique' })
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['assist_natural_key'], 'assists_natural_key_unique')
      table.dropColumn('assist_natural_key')
    })
  }
}
