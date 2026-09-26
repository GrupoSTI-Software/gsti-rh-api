import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'regulatory_authorities'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('regulatory_authority_id').notNullable()

      table.string('regulatory_authority_slug', 50).notNullable().unique()
      table.string('regulatory_authority_short_name', 50).notNullable()
      table.string('regulatory_authority_full_name', 255).notNullable()
      table.string('regulatory_authority_country_code', 3).notNullable().defaultTo('MX')
      table
        .enum('regulatory_authority_jurisdiction', ['federal', 'local', 'estatal'])
        .notNullable()
      table.string('regulatory_authority_description_key', 150).nullable()
      table.string('regulatory_authority_audit_description_key', 150).nullable()
      table.string('regulatory_authority_website', 255).nullable()
      table.string('regulatory_authority_icon', 50).nullable()
      table.string('regulatory_authority_brand_color', 7).nullable()
      table.tinyint('regulatory_authority_is_active').notNullable().defaultTo(1)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
