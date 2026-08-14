import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_levels'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('position_level_id').notNullable()

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table.string('position_level_name', 100).notNullable()

      // Posición jerárquica ascendente (regla 3). Sin índice único: la unicidad
      // se garantiza en el servicio renumerando 1..n dentro de una transacción.
      table.integer('position_level_rank').notNullable()

      table.boolean('position_level_active').notNullable().defaultTo(true)

      table.timestamp('position_level_created_at').notNullable()
      table.timestamp('position_level_updated_at').nullable()
      table.timestamp('position_level_deleted_at').nullable()

      // Orden del listado por empresa
      table.index(['business_unit_id', 'position_level_rank'], 'idx_position_levels_bu_rank')
      // Apoya la verificación de nombre único por empresa excluyendo eliminados;
      // no puede ser único porque MySQL no soporta índices únicos parciales.
      table.index(['business_unit_id', 'position_level_name'], 'idx_position_levels_bu_name')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
