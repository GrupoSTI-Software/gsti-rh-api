import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Unifica el nombre de la marca de pertenencia de `career_path_templates`
 * con el estándar del producto (USRH1786648598956). `company_id` era la
 * única excepción de nomenclatura viva entre las 102 entidades que
 * componen `withBusinessUnitScope`; esta migración la elimina.
 *
 * Puro rename de metadata: mismo tipo (INT UNSIGNED), misma nulabilidad
 * (NOT NULL, ya cerrada por `1785800000020`), misma FK hacia
 * `business_units`, sin `onDelete` (la original no lo tiene). Cero
 * backfill, cero fila tocada.
 *
 * No se usa `renameColumn` a secas: knex solo detecta y recrea FKs
 * ENTRANTES (`getFKRefs` filtra por `REFERENCED_TABLE_NAME = tableName`
 * en `mysql-tablecompiler.js`), y la FK de `company_id` es SALIENTE
 * (`REFERENCED_TABLE_NAME = business_units`). Se suelta y se recrea a
 * mano, espejando
 * `1776400000001_rename_psychometric_test_dimensions_to_assessment_template_dimensions.ts`.
 *
 * Verificado contra BD el 2026-08-21 (V-1..V-4 del spec): FK e índice se
 * llaman `career_path_templates_company_id_foreign` (mismo nombre para
 * ambos, InnoDB los crea juntos con la FK original); columna NOT NULL;
 * motor MySQL 9.4.0.
 */
export default class extends BaseSchema {
  protected tableName = 'career_path_templates'
  protected oldColumn = 'company_id'
  protected newColumn = 'business_unit_id'
  protected oldForeignKey = 'career_path_templates_company_id_foreign'
  protected renamedIndex = 'career_path_templates_business_unit_id_index'
  protected newForeignKey = 'career_path_templates_business_unit_id_foreign'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign([this.oldColumn], this.oldForeignKey)
    })

    this.schema.raw(
      `ALTER TABLE \`${this.tableName}\` RENAME INDEX \`${this.oldForeignKey}\` TO \`${this.renamedIndex}\``
    )

    this.schema.alterTable(this.tableName, (table) => {
      table.renameColumn(this.oldColumn, this.newColumn)
    })

    this.schema.alterTable(this.tableName, (table) => {
      table
        .foreign(this.newColumn, this.newForeignKey)
        .references('business_unit_id')
        .inTable('business_units')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign([this.newColumn], this.newForeignKey)
    })

    this.schema.raw(
      `ALTER TABLE \`${this.tableName}\` RENAME INDEX \`${this.renamedIndex}\` TO \`${this.oldForeignKey}\``
    )

    this.schema.alterTable(this.tableName, (table) => {
      table.renameColumn(this.newColumn, this.oldColumn)
    })

    this.schema.alterTable(this.tableName, (table) => {
      table
        .foreign(this.oldColumn, this.oldForeignKey)
        .references('business_unit_id')
        .inTable('business_units')
    })
  }
}
