import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Catálogo de conceptos de salida por empresa (USRH1786568279581).
 *
 * Cada empresa tiene su propia copia del catálogo (sin filas globales): la
 * siembra perezosa del conjunto base corre en el primer GET del catálogo.
 * `offboarding_concept_active` y `offboarding_concept_order` nacen aquí
 * aunque esta historia no ofrezca activar/desactivar ni reordenar: la HU
 * "Activar, desactivar y ordenar los conceptos de salida" (USRH1786568279584)
 * las pone a trabajar sin migración nueva.
 *
 * Ningún índice único: MySQL no soporta índices únicos parciales y la tabla
 * lleva borrado lógico — un único sobre (business_unit_id, name) impediría
 * reutilizar el nombre de un concepto eliminado, y uno sobre
 * (business_unit_id, source) impediría eliminar y volver a sembrar. La
 * unicidad de nombre (regla 4) y la del origen derivado (regla 6) viven en el
 * servicio sobre filas bloqueadas con forUpdate, igual que en
 * `1785380505989_create_position_levels_table.ts:32-33`.
 */
export default class extends BaseSchema {
  protected tableName = 'offboarding_concepts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('offboarding_concept_id').notNullable()

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table.string('offboarding_concept_name', 150).notNullable()
      table.string('offboarding_concept_description', 500).nullable()

      // 'manual' | 'employee_supplies' — string, no enum: el conjunto válido
      // vive en concepts.constants.ts y lo valida el servicio; un tercer
      // origen entra sin migración de esquema.
      table.string('offboarding_concept_source', 30).notNullable().defaultTo('manual')

      table.boolean('offboarding_concept_requires_evidence').notNullable().defaultTo(false)
      table.boolean('offboarding_concept_allows_amount').notNullable().defaultTo(false)
      table.boolean('offboarding_concept_active').notNullable().defaultTo(true)
      table.integer('offboarding_concept_order').notNullable().defaultTo(0)

      table.timestamp('offboarding_concept_created_at').notNullable()
      table.timestamp('offboarding_concept_updated_at').nullable()
      table.timestamp('offboarding_concept_deleted_at').nullable()

      // Orden del listado por empresa
      table.index(
        ['business_unit_id', 'offboarding_concept_order'],
        'idx_offboarding_concepts_bu_order'
      )
      // Apoya la verificación de nombre único por empresa excluyendo eliminados
      table.index(
        ['business_unit_id', 'offboarding_concept_name'],
        'idx_offboarding_concepts_bu_name'
      )
      // Apoya la unicidad del concepto derivado del inventario (regla 6)
      table.index(
        ['business_unit_id', 'offboarding_concept_source'],
        'idx_offboarding_concepts_bu_source'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
