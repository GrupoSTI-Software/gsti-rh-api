import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * CAP-02-08-01 — Activar / desactivar plantilla de evaluación.
 *
 * Agrega la columna `assessment_template_is_active` (BOOLEAN NOT NULL
 * DEFAULT true) a la tabla `assessment_templates` para permitir pausar
 * una evaluación sin recurrir a soft-delete: el histórico y la
 * asignación se conservan, pero el listado por defecto excluye las
 * inactivas y nuevas asignaciones/capturas pueden bloquearse en HUs
 * posteriores (CAP-02-08-02 / CAP-02-08-04).
 *
 * Migración reversible: el `down()` elimina la columna.
 */
export default class extends BaseSchema {
  protected tableName = 'assessment_templates'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('assessment_template_is_active').notNullable().defaultTo(true)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('assessment_template_is_active')
    })
  }
}
