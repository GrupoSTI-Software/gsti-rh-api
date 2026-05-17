import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * CAP-02-08-04 — Coherencia del perfil del puesto con el tipo de dato de la dimensión.
 *
 * - Hace `position_assessment_profile_minimum_value` y
 *   `position_assessment_profile_maximum_value` NULLABLE: dejan de aplicar para
 *   dimensiones de tipo `categorical_amb` (Alto/Medio/Bajo), que no tienen rango.
 * - Agrega `position_assessment_profile_expected_value` ENUM('high','medium','low')
 *   NULL para almacenar el valor único esperado en dimensiones categóricas.
 *
 * Para dimensiones `numeric` y `percent` el comportamiento existente se mantiene:
 * los perfiles ya creados conservan sus rangos numéricos y `expected_value` es null.
 *
 * Migración reversible: el `down()` revierte ambos cambios.
 */
export default class extends BaseSchema {
  protected tableName = 'position_assessment_profiles'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('position_assessment_profile_minimum_value', 10, 2).nullable().alter()
      table.decimal('position_assessment_profile_maximum_value', 10, 2).nullable().alter()
      table.enum('position_assessment_profile_expected_value', ['high', 'medium', 'low']).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('position_assessment_profile_expected_value')
      table.decimal('position_assessment_profile_minimum_value', 10, 2).notNullable().alter()
      table.decimal('position_assessment_profile_maximum_value', 10, 2).notNullable().alter()
    })
  }
}
