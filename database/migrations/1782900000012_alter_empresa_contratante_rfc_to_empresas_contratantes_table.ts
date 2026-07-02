import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'empresas_contratantes'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('empresa_contratante_rfc', 191).notNullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('empresa_contratante_rfc', 13).notNullable().alter()
    })
  }
}
