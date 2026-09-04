import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Registro de alianzas comerciales de GSTI (USRH1788505941892).
 *
 * Tabla global sin `business_unit_id`: la alianza es dato de plataforma, no
 * de tenant. El aislamiento lo da el guard `platformAdmin` de la ruta, no
 * un mixin de alcance.
 *
 * `alliance_name` no lleva UNIQUE: dos altas con el mismo nombre crean dos
 * filas (decisión cerrada). `alliance_default_term_periods` NULL significa
 * plazo indeterminado. Ningún endpoint de esta HU escribe `alliance_deleted_at`.
 */
export default class extends BaseSchema {
  protected tableName = 'alliances'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('alliance_id').notNullable()

      table.string('alliance_name', 160).notNullable()
      table.string('alliance_contact_name', 160).nullable()
      table.string('alliance_contact_email', 191).nullable()
      table.string('alliance_contact_phone', 30).nullable()

      table.decimal('alliance_default_commission_percent', 5, 2).notNullable()

      table
        .integer('alliance_default_term_periods')
        .unsigned()
        .nullable()
        .comment('NULL = plazo indeterminado')

      table.tinyint('alliance_active').unsigned().notNullable().defaultTo(1)

      table.timestamps(true, true)

      table.timestamp('alliance_deleted_at').nullable().defaultTo(null)

      table.index(['alliance_active'], 'idx_alliances_active')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
