import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * HU-6: adjuntos de una solicitud de permiso.
 *
 * ## Por que la tabla lleva `business_unit_id`
 * La pertenencia de una solicitud se deduce por su empleado, y eso obliga a un
 * join en cada consulta. Un adjunto se sirve como archivo: la ruta que lo
 * entrega tiene que poder decidir en una sola lectura si el archivo es de la
 * empresa que lo pide. La marca directa es lo que hace ese corte barato y
 * evidente, igual que en `employee_assist_calendar`.
 *
 * ## Que NO guarda
 * El nombre con el que el cliente subio el archivo se conserva solo para
 * mostrarlo; la ruta real en el bucket la decide el servidor y vive en
 * `attachment_storage_key`, que nunca viaja al navegador. El MIME almacenado es
 * el que devolvio el intake tras inspeccionar el contenido, no el que declaro
 * el navegador.
 */
export default class extends BaseSchema {
  protected tableName = 'exception_request_attachments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('exception_request_attachment_id').primary()

      table
        .integer('exception_request_id')
        .unsigned()
        .notNullable()
        .references('exception_requests.exception_request_id')
        .onDelete('CASCADE')

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_units.business_unit_id')

      table.string('attachment_storage_key', 512).notNullable()
      table.string('attachment_original_name', 255).notNullable()
      table.string('attachment_mime', 128).notNullable()
      table.bigInteger('attachment_size_bytes').unsigned().notNullable()

      table
        .integer('uploaded_by_user_id')
        .unsigned()
        .nullable()
        .references('users.user_id')
        .onDelete('SET NULL')

      table.timestamp('exception_request_attachment_created_at').notNullable()
      table.timestamp('exception_request_attachment_updated_at').notNullable()
      table.timestamp('exception_request_attachment_deleted_at').nullable()

      // El listado del detalle pide los adjuntos de UNA solicitud dentro de UNA
      // empresa: ese es el índice que sirve a la consulta real.
      table.index(
        ['exception_request_id', 'business_unit_id'],
        'exception_request_attachments_request_business_unit_index'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
