import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Avisos de privacidad por empresa (VLRH-H1791306079310, §10): una fila por
 * versión y empresa, con scope multi-tenant y borrador descartable por soft
 * delete —nada más se borra (C0129 R3, CA-17): las versiones publicadas solo
 * cambian `…_is_current` dentro del `publish`—.
 *
 * La versión SIEMPRE se incrementa (nunca se reutiliza), así que el
 * `unique(business_unit_id, telework_photo_notice_version)` es válido en MySQL
 * sin un índice único parcial filtrado por `deleted_at` (no soportado).
 *
 * `…_content` conserva el texto con marcadores; `…_rendered_content` guarda el
 * texto ya resuelto y saneado que se publica. `…_content_hash` es la huella
 * SHA-256 del título y el texto resuelto.
 */
export default class extends BaseSchema {
  protected tableName = 'telework_photo_notices'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('telework_photo_notice_id')

      table.integer('business_unit_id').unsigned().notNullable()
      table.integer('telework_photo_notice_template_id').unsigned().nullable()

      table.integer('telework_photo_notice_version').unsigned().notNullable()
      table.string('telework_photo_notice_title', 150).notNullable()
      table.text('telework_photo_notice_content', 'longtext').notNullable()
      table.text('telework_photo_notice_rendered_content', 'longtext').nullable()
      table
        .enum('telework_photo_notice_status', ['draft', 'published'])
        .notNullable()
        .defaultTo('draft')
      table.boolean('telework_photo_notice_is_current').notNullable().defaultTo(false)
      table.string('telework_photo_notice_content_hash', 128).nullable()

      table.integer('created_by_user_id').unsigned().notNullable()
      table.integer('updated_by_user_id').unsigned().notNullable()
      table.integer('published_by_user_id').unsigned().nullable()
      table.timestamp('published_at').nullable()

      table.timestamp('telework_photo_notice_created_at').notNullable()
      table.timestamp('telework_photo_notice_updated_at').notNullable()
      table.timestamp('telework_photo_notice_deleted_at').nullable()

      table
        .foreign('business_unit_id', 'fk_twpn_business_unit')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('CASCADE')

      // La plantilla que originó el borrador: `SET NULL` porque la baja de una
      // plantilla no puede llevarse por delante avisos ya publicados.
      table
        .foreign('telework_photo_notice_template_id', 'fk_twpn_template')
        .references('telework_photo_notice_template_id')
        .inTable('telework_photo_notice_templates')
        .onDelete('SET NULL')

      table
        .foreign('created_by_user_id', 'fk_twpn_created_by_user')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table
        .foreign('updated_by_user_id', 'fk_twpn_updated_by_user')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table
        .foreign('published_by_user_id', 'fk_twpn_published_by_user')
        .references('user_id')
        .inTable('users')
        .onDelete('SET NULL')

      table.unique(['business_unit_id', 'telework_photo_notice_version'], {
        indexName: 'uq_twpn_business_unit_version',
      })
      table.index(
        ['business_unit_id', 'telework_photo_notice_is_current'],
        'idx_twpn_business_unit_current'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
