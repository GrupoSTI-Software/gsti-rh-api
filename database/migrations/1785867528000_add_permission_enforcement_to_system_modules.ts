import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'system_modules'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('system_module_permission_enforcement_active').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('system_module_permission_enforcement_active')
    })
  }
}
