import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Política de retención de evidencia NOM-035 por empresa (ESB-08-06-03-01).
 *
 * Registra, por business unit, si la retención está activa y por cuántos años
 * se debe conservar la evidencia NOM-035. Es la raíz de la cadena CAP-08-06-03:
 * el bloqueo de borrado (ESB-08-06-03-02) y la UI (ESB-08-06-03-03) leen este contrato.
 *
 * Convenciones del repo aplicadas:
 *  - Tabla plural `retention_policies`; columnas con prefijo `retention_policy_`.
 *  - Unicidad en `business_unit_id` (a lo sumo una política por empresa).
 *  - Soft delete en `retention_policy_deleted_at`.
 *  - Auditoría de escritura en `created_by` / `updated_by` (FK a users).
 */
export default class extends BaseSchema {
  protected tableName = 'retention_policies'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('retention_policy_id').notNullable()

      table.integer('business_unit_id').unsigned().notNullable()

      table.boolean('retention_policy_is_active').notNullable().defaultTo(false)

      table.integer('retention_policy_retention_years').unsigned().notNullable().defaultTo(4)

      table.json('retention_policy_covered_evidence_types').notNullable()

      table.integer('retention_policy_created_by_user_id').unsigned().notNullable()
      table.integer('retention_policy_updated_by_user_id').unsigned().notNullable()

      table.timestamp('retention_policy_created_at').notNullable()
      table.timestamp('retention_policy_updated_at').notNullable()
      table.timestamp('retention_policy_deleted_at').nullable()

      table
        .foreign('business_unit_id', 'fk_rp_business_unit')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('CASCADE')

      table
        .foreign('retention_policy_created_by_user_id', 'fk_rp_created_by_user')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table
        .foreign('retention_policy_updated_by_user_id', 'fk_rp_updated_by_user')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table.unique(['business_unit_id'], { indexName: 'uq_rp_business_unit' })

      table.index(
        ['business_unit_id', 'retention_policy_is_active'],
        'idx_rp_business_unit_active'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
