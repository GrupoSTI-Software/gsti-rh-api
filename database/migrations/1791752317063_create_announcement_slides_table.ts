import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Slides del deck de anuncios del Backoffice (overlay de bienvenida y novedades).
 *
 * Diseño:
 *  - Catálogo global de plataforma: sin `business_unit_id` ni mixin de tenant. Lo
 *    administra la consola de plataforma, igual que `legal_documents`.
 *  - Solo español: el texto vive en columnas simples, sin mapa por idioma.
 *  - `announcement_slide_published_at` con milisegundos: el BO compara esta fecha
 *    contra la marca del usuario (`user_announcement_state_last_seen_at`, también
 *    TIMESTAMP(3)); redondear al segundo podría ocultar o repetir un slide. La fija
 *    el API al publicar por primera vez y no cambia al editar ni al archivar.
 *  - `announcement_slide_body_html` guarda HTML ya saneado por el API.
 *  - `announcement_slide_banner_path` es la llave del objeto en S3 (privado); el
 *    deck la entrega como URL firmada.
 *  - `announcement_slide_permission_key` es `<moduleSlug>:<permissionSlug>` del
 *    catálogo; el API la valida al escribir. Sin FK: el catálogo se identifica por
 *    slug, nunca por id.
 */
export default class extends BaseSchema {
  protected tableName = 'announcement_slides'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('announcement_slide_id').notNullable()

      table.enum('announcement_slide_type', ['onboarding', 'feature']).notNullable()
      table.integer('announcement_slide_sort_order').notNullable().defaultTo(0)
      table
        .enum('announcement_slide_status', ['draft', 'published', 'archived'])
        .notNullable()
        .defaultTo('draft')
      table.timestamp('announcement_slide_published_at', { precision: 3 }).nullable()

      table.string('announcement_slide_title', 120).notNullable()
      table.text('announcement_slide_body_html').notNullable()
      table.string('announcement_slide_banner_path', 512).nullable()
      table.string('announcement_slide_permission_key', 150).nullable()

      table.timestamp('announcement_slide_created_at').notNullable()
      table.timestamp('announcement_slide_updated_at').nullable()

      table.index(
        ['announcement_slide_status', 'announcement_slide_type'],
        'idx_announcement_slides_status_type'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
