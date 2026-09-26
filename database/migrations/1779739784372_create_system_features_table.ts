import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'system_features'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('system_feature_id').notNullable()

      table
        .integer('system_module_id')
        .unsigned()
        .notNullable()
        .references('system_module_id')
        .inTable('system_modules')
        .onDelete('RESTRICT')

      table.string('system_feature_name', 100).notNullable()
      table.string('system_feature_slug', 150).notNullable()
      table.string('system_feature_description', 200).nullable()

      table
        .enum('system_feature_status', ['planeado', 'en_desarrollo', 'disponible', 'deprecado'])
        .notNullable()
        .defaultTo('planeado')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()

      table.unique(['system_module_id', 'system_feature_slug'], {
        indexName: 'uq_system_features_module_slug',
      })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
