import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'vacation_authorization_signatures'

  async up() {
    if (await this.schema.hasColumn(this.tableName, 'exception_request_id')) {
      this.schema.alterTable(this.tableName, (table) => {
        // Primero eliminar la restricción existente
        table.dropForeign(['exception_request_id'])

        // Luego modificar la columna
        table.integer('exception_request_id')
          .unsigned()
          .nullable()
          .alter()

        // Finalmente volver a agregar la FK (opcional, si quieres mantenerla)
        table.foreign('exception_request_id')
          .references('exception_request_id')
          .inTable('exception_requests')
          .onDelete('CASCADE')
      })
    }
  }

  async down() {
    if (await this.schema.hasColumn(this.tableName, 'exception_request_id')) {
      this.schema.alterTable(this.tableName, (table) => {
        table.dropForeign(['exception_request_id'])
        table.integer('exception_request_id')
          .unsigned()
          .notNullable()
          .references('exception_request_id')
          .inTable('exception_requests')
          .onDelete('CASCADE')
      })
    }
  }
}
