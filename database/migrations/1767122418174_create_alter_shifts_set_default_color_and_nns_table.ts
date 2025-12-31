import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'shifts'

  async up() {
    await this.db.from(this.tableName)
      .whereNull('shift_color')
      .update({ shift_color: '#ffffff' })

    this.schema.alterTable(this.tableName, (table) => {
      table.string('shift_color', 50).defaultTo('#ffffff').notNullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('shift_color', 50).nullable().alter()
    })
  }
}
