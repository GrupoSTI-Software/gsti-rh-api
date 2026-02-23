import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'assists'

  async up() {
    this.schema.table(this.tableName, (table) => {
      table.string('assist_uuid', 36).nullable().after('assist_id')
    })
  }

  async down() {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('assist_uuid')
    })
  }
}
