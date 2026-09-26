import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Bitácora inmutable de accesos al expediente documental REPSE (USRH1784259105702).
 * Una fila por consulta de listado, descarga o eliminación autorizada dentro de
 * retención. Sin `updated_at` ni soft delete: registro legal de auditoría.
 */
export default class extends BaseSchema {
  protected tableName = 'repse_expediente_accesos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('repse_expediente_acceso_id').notNullable()

      table
        .integer('repse_expediente_documento_id')
        .unsigned()
        .notNullable()
        .references('repse_expediente_documento_id')
        .inTable('repse_expediente_documentos')
        .withKeyName('fk_rea_documento')
        .onDelete('CASCADE')

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .withKeyName('fk_rea_business_unit')
        .onDelete('RESTRICT')

      table.string('repse_expediente_acceso_accion', 20).notNullable()

      table
        .integer('repse_expediente_acceso_user_id')
        .unsigned()
        .notNullable()
        .references('user_id')
        .inTable('users')
        .withKeyName('fk_rea_user')
        .onDelete('RESTRICT')

      table
        .timestamp('repse_expediente_acceso_created_at')
        .notNullable()
        .defaultTo(this.now())

      table.index(['repse_expediente_documento_id'], 'idx_rea_documento')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
