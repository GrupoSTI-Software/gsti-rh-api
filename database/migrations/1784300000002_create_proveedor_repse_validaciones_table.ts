import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Bitácora de validaciones periódicas del folio de un proveedor REPSE
 * (USRH1784259105646). Cada fila es la constancia de que el responsable de
 * cumplimiento consultó el padrón público de la STPS y deja rastro de quién,
 * cuándo y con qué evidencia.
 *
 * Es un registro de auditoría legal: **inmutable**. No lleva
 * `updated_at`/`deleted_at` a propósito — una validación nunca se edita ni se
 * borra, solo se agregan nuevas.
 *
 * `business_unit_id` va denormalizado (igual que
 * `documentos_contrato_especializado`) para poder filtrar por tenant sin
 * depender de un join al padre en cada consulta.
 *
 * ON DELETE CASCADE hacia `proveedores_repse`: si el proveedor se elimina
 * físicamente (fuera del flujo normal de soft delete), su bitácora cae con él.
 */
export default class extends BaseSchema {
  protected tableName = 'proveedor_repse_validaciones'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('proveedor_repse_validacion_id').notNullable()

      table
        .integer('proveedor_repse_id')
        .unsigned()
        .notNullable()
        .references('proveedor_repse_id')
        .inTable('proveedores_repse')
        .withKeyName('fk_prv_proveedor')
        .onDelete('CASCADE')

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .withKeyName('fk_prv_business_unit')
        .onDelete('RESTRICT')

      table
        .enum('proveedor_repse_validacion_estatus', ['vigente', 'no_vigente'])
        .notNullable()

      table.date('proveedor_repse_validacion_fecha').notNullable()

      table
        .integer('proveedor_repse_validacion_autor_user_id')
        .unsigned()
        .notNullable()
        .references('user_id')
        .inTable('users')
        .withKeyName('fk_prv_autor_user')
        .onDelete('RESTRICT')

      table.string('proveedor_repse_validacion_evidencia_nombre_archivo', 255).notNullable()
      table.string('proveedor_repse_validacion_evidencia_storage_key', 512).notNullable()
      table.string('proveedor_repse_validacion_evidencia_mime_type', 100).notNullable()
      table
        .integer('proveedor_repse_validacion_evidencia_tamano_bytes')
        .unsigned()
        .notNullable()

      table
        .timestamp('proveedor_repse_validacion_created_at')
        .notNullable()
        .defaultTo(this.now())

      table.index(
        ['proveedor_repse_id', 'proveedor_repse_validacion_fecha'],
        'idx_prv_proveedor_fecha'
      )
      table.index(['business_unit_id', 'proveedor_repse_id'], 'idx_prv_business_unit_proveedor')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
