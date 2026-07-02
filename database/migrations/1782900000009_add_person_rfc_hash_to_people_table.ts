import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'people'
  protected wrapInTransaction = false

  async up() {
    await this.schema.alterTable(this.tableName, (table) => {
      table.string('person_rfc_hash', 64).nullable().after('person_rfc')
    })
  }

  async down() {
    await this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('person_rfc_hash')
    })
  }
}
