import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Vínculo opcional sucursal ↔ empresa contratante (sitio de servicio REPSE).
 *
 * - Nullable: la mayoría de sucursales no son sitios de servicio.
 * - RESTRICT: la empresa no puede eliminarse físicamente con sitios ligados;
 *   el soft delete se bloquea en servicio con 422.
 */
export default class extends BaseSchema {
  protected tableName = 'branch_offices'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('empresa_contratante_id')
        .unsigned()
        .nullable()
        .references('empresa_contratante_id')
        .inTable('empresas_contratantes')
        .withKeyName('fk_branch_offices_empresa_contratante')
        .onDelete('RESTRICT')

      table.index(['empresa_contratante_id'], 'idx_branch_offices_empresa_contratante_id')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['empresa_contratante_id'], 'fk_branch_offices_empresa_contratante')
      table.dropIndex(['empresa_contratante_id'], 'idx_branch_offices_empresa_contratante_id')
      table.dropColumn('empresa_contratante_id')
    })
  }
}
