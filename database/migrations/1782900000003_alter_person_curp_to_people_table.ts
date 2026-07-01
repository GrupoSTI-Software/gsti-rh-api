import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'people'

  async up() {
    await this.schema.alterTable(this.tableName, (table) => {
      table.string('person_curp', 191).nullable().alter()
    })
  }

  async down() {
    await this.schema.alterTable(this.tableName, (table) => {
      table.string('person_curp', 45).nullable().alter()
    })
  }
}
