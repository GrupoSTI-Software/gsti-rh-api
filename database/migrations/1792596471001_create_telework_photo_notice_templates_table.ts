import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Plantilla base GLOBAL del aviso de privacidad de la evidencia fotográfica del
 * puesto de trabajo (VLRH-H1791306079310, §10). Espejo de
 * `telework_policy_templates`: sin `business_unit_id`, sin soft delete y una
 * sola fila vigente por versión (`…_template_is_current`).
 *
 * El texto legal es DATO de la plantilla, no código: nace con el párrafo
 * provisional del seeder `0067` —marcado con su leyenda y su marcador
 * `{{razon_social}}`— y el machote definitivo lo entrega asesoría (C0129 R11).
 * Los marcadores se resuelven al publicar el aviso de cada empresa, nunca aquí.
 */
export default class extends BaseSchema {
  protected tableName = 'telework_photo_notice_templates'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('telework_photo_notice_template_id')

      table.string('telework_photo_notice_template_version', 20).notNullable()
      table.string('telework_photo_notice_template_title', 150).notNullable()
      table.text('telework_photo_notice_template_content', 'longtext').notNullable()
      table.boolean('telework_photo_notice_template_is_current').notNullable().defaultTo(true)

      table.timestamp('telework_photo_notice_template_created_at').notNullable()
      table.timestamp('telework_photo_notice_template_updated_at').nullable()

      // Nombre explícito: el que deriva MySQL del nombre de la columna mide 71
      // caracteres y el límite de identificadores es 64.
      table.unique(['telework_photo_notice_template_version'], {
        indexName: 'uq_twpnt_version',
      })
      table.index(['telework_photo_notice_template_is_current'], 'idx_twpnt_current')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
