import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'proceeding_file_type_properties'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('proceeding_file_type_property_type', [
          'Text',
          'File',
          'Currency',
          'Decimal',
          'Number',
          'Date',
        ])
        .notNullable()
        .alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('proceeding_file_type_property_type', [
          'Text',
          'File',
          'Currency',
          'Decimal',
          'Number',
        ])
        .notNullable()
        .alter()
    })
  }
}

