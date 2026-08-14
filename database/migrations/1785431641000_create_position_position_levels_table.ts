import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_position_levels'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('position_position_level_id').notNullable()

      table
        .integer('position_id')
        .unsigned()
        .notNullable()
        .references('position_id')
        .inTable('positions')
        .onDelete('RESTRICT')

      // NULL cuando el renglón es un nivel ad-hoc del puesto (regla 5).
      table
        .integer('position_level_id')
        .unsigned()
        .nullable()
        .references('position_level_id')
        .inTable('position_levels')
        .onDelete('RESTRICT')

      // NOT NULL solo cuando position_level_id es NULL; el XOR de la regla 5
      // se garantiza en el servicio dentro de la transacción de guardado.
      table.string('position_position_level_ad_hoc_name', 100).nullable()

      // Secuencia única mezclada catálogo + ad-hoc dentro del puesto (regla 7);
      // el servicio renumera 1..n en cada reemplazo del bloque.
      table.integer('position_position_level_rank').notNullable()

      // Máximo un default vivo por puesto (regla 8); validado en el servicio.
      table.boolean('position_position_level_is_default').notNullable().defaultTo(false)

      table.boolean('position_position_level_active').notNullable().defaultTo(true)

      // Defensa en profundidad (regla 13): derivada del puesto, nunca del payload.
      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table.timestamp('position_position_level_created_at').notNullable()
      table.timestamp('position_position_level_updated_at').nullable()
      table.timestamp('position_position_level_deleted_at').nullable()

      // Orden del listado por puesto
      table.index(['position_id', 'position_position_level_rank'], 'idx_ppl_position_rank')
      // Apoya la unicidad de la regla 3 excluyendo eliminados; no puede ser
      // único porque MySQL no soporta índices únicos parciales.
      table.index(['position_id', 'position_level_id'], 'idx_ppl_position_level')
      // Apoyo del scope multi-tenant
      table.index(['business_unit_id'], 'idx_ppl_business_unit')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
