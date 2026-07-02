import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'people'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('person_imss_nss', 191).nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('person_imss_nss', 45).nullable().alter()
    })
  }
}
