import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Documentos del expediente fiscal de un proveedor REPSE (USRH1784259105702).
 * Cada fila es un archivo clasificado por tipo y periodo, con retención normativa
 * de 5 años. El binario vive en S3 privado (`storage_key`); aquí solo metadatos.
 */
export default class extends BaseSchema {
  protected tableName = 'repse_expediente_documentos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('repse_expediente_documento_id').notNullable()

      table
        .integer('proveedor_repse_id')
        .unsigned()
        .notNullable()
        .references('proveedor_repse_id')
        .inTable('proveedores_repse')
        .withKeyName('fk_red_proveedor')
        .onDelete('CASCADE')

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .withKeyName('fk_red_business_unit')
        .onDelete('RESTRICT')

      table.string('repse_expediente_documento_tipo', 40).notNullable()
      table.smallint('repse_expediente_documento_anio').unsigned().notNullable()
      table.tinyint('repse_expediente_documento_mes').unsigned().nullable()
      table.tinyint('repse_expediente_documento_cuatrimestre').unsigned().nullable()
      table.date('repse_expediente_documento_fecha_documento').nullable()
      table.date('repse_expediente_documento_conservar_hasta').notNullable()

      table.string('repse_expediente_documento_nombre_archivo', 255).notNullable()
      table.string('repse_expediente_documento_storage_key', 512).notNullable()
      table.string('repse_expediente_documento_mime_type', 100).notNullable()
      table.integer('repse_expediente_documento_tamano_bytes').unsigned().notNullable()

      table
        .integer('repse_expediente_documento_subido_por')
        .unsigned()
        .nullable()
        .references('user_id')
        .inTable('users')
        .withKeyName('fk_red_user')
        .onDelete('SET NULL')

      table
        .timestamp('repse_expediente_documento_created_at')
        .notNullable()
        .defaultTo(this.now())
      table.timestamp('repse_expediente_documento_updated_at').nullable()
      table.timestamp('repse_expediente_documento_deleted_at').nullable().defaultTo(null)

      table.index(
        ['proveedor_repse_id', 'repse_expediente_documento_tipo', 'repse_expediente_documento_anio'],
        'idx_red_prov_tipo_anio'
      )
      table.index(['business_unit_id'], 'idx_red_business_unit')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
