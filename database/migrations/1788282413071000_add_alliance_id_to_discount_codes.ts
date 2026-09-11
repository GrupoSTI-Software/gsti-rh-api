import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Marca de pertenencia del código de descuento a una alianza comercial
 * (USRH1788505941894). NULL = código del catálogo general, sin dueño.
 *
 * El UNIQUE sobre `discount_code_alliance_id` garantiza una alianza, un
 * código. MySQL admite varios NULL en un UNIQUE, así que los códigos
 * sin dueño no colisionan entre sí.
 */
export default class extends BaseSchema {
  protected tableName = 'discount_codes'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('discount_code_alliance_id')
        .unsigned()
        .nullable()
        .references('alliance_id')
        .inTable('alliances')
        .onDelete('RESTRICT')
    })

    this.schema.raw(`
      ALTER TABLE \`discount_codes\`
      ADD UNIQUE KEY \`uq_discount_code_alliance_id\` (\`discount_code_alliance_id\`)
    `)
  }

  async down() {
    this.schema.raw(`
      ALTER TABLE \`discount_codes\`
      DROP INDEX \`uq_discount_code_alliance_id\`
    `)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['discount_code_alliance_id'])
      table.dropColumn('discount_code_alliance_id')
    })
  }
}
