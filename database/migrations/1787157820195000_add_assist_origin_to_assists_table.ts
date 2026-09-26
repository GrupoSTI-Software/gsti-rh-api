import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Procedencia y captor de la checada en la fila (USRH1787157820195).
 * Nullable sin default: históricos quedan NULL = origen no determinado.
 * Sin FK ni índice: el id del captor sobrevive aunque el usuario se elimine (regla 5).
 */
export default class extends BaseSchema {
  protected tableName = 'assists'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('assist_origin', 20).nullable().after('assist_type')
      table.integer('assist_created_by_user_id').unsigned().nullable().after('assist_origin')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('assist_created_by_user_id')
      table.dropColumn('assist_origin')
    })
  }
}
