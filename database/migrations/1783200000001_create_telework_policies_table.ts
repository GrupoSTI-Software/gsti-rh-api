import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Política de Teletrabajo por empresa (NOM-037-STPS-2023, numeral 5.2),
 * documento versionable espejo de `legal_documents` + scope multi-tenant
 * espejo de `retention_policies` (USRH1783566072187).
 *
 * En esta HU solo se opera el borrador (`telework_policy_status = 'draft'`):
 * publicar, `is_current` e historial vigente los habilita la hermana
 * ESB-08-07-02-02. `telework_policy_content_hash`, `published_by_user_id` y
 * `published_at` quedan reservados para esa hermana.
 *
 * La versión SIEMPRE se incrementa (nunca se reutiliza un número), incluso al
 * reinicializar tras descartar un borrador: así el `unique(business_unit_id,
 * telework_policy_version)` es válido en MySQL sin necesitar un índice único
 * parcial filtrado por `deleted_at` (no soportado).
 */
export default class extends BaseSchema {
  protected tableName = 'telework_policies'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('telework_policy_id').notNullable()

      table.integer('business_unit_id').unsigned().notNullable()

      table.integer('telework_policy_version').unsigned().notNullable()
      table.string('telework_policy_title', 150).notNullable()
      table.json('telework_policy_components').notNullable()
      table.enum('telework_policy_status', ['draft', 'published']).notNullable().defaultTo('draft')
      table.boolean('telework_policy_is_current').notNullable().defaultTo(false)
      table.string('telework_policy_content_hash', 128).nullable()

      table.integer('created_by_user_id').unsigned().notNullable()
      table.integer('updated_by_user_id').unsigned().notNullable()
      table.integer('published_by_user_id').unsigned().nullable()
      table.timestamp('published_at').nullable()

      table.timestamp('telework_policy_created_at').notNullable()
      table.timestamp('telework_policy_updated_at').notNullable()
      table.timestamp('telework_policy_deleted_at').nullable()

      table
        .foreign('business_unit_id', 'fk_twp_business_unit')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('CASCADE')

      table
        .foreign('created_by_user_id', 'fk_twp_created_by_user')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table
        .foreign('updated_by_user_id', 'fk_twp_updated_by_user')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table
        .foreign('published_by_user_id', 'fk_twp_published_by_user')
        .references('user_id')
        .inTable('users')
        .onDelete('SET NULL')

      table.unique(['business_unit_id', 'telework_policy_version'], {
        indexName: 'uq_twp_business_unit_version',
      })
      table.index(
        ['business_unit_id', 'telework_policy_is_current'],
        'idx_twp_business_unit_current'
      )
      table.index(['business_unit_id', 'telework_policy_status'], 'idx_twp_business_unit_status')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
