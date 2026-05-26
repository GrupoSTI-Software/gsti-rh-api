import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Crea la tabla `repse_specialized_services` que almacena el catálogo de
 * actividades o servicios especializados amparados por un registro REPSE.
 *
 * Cada renglón cuelga de un `RepseRegistration` (padre) y describe uno de
 * los servicios que la empresa prestadora declara ofrecer ante la STPS.
 *
 * Detalles de diseño:
 *
 * - Prefijo `repse_specialized_service_*` en columnas propias para mantener
 *   consistencia con el resto del módulo REPSE.
 * - FK `repse_registration_id` con `RESTRICT`: el catálogo no puede vivir
 *   sin su registro padre y queremos evitar borrados accidentales en cascada.
 * - Soft delete: `repse_specialized_service_deleted_at` para auditoría y
 *   reuso futuro de nombres tras eliminar lógicamente.
 * - Índice `(repse_registration_id, repse_specialized_service_deleted_at)`
 *   para acelerar los listados filtrados por registro padre.
 */
export default class extends BaseSchema {
  protected tableName = 'repse_specialized_services'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('repse_specialized_service_id').notNullable()

      table
        .integer('repse_registration_id')
        .unsigned()
        .notNullable()
        .references('repse_registration_id')
        .inTable('repse_registrations')
        .onDelete('RESTRICT')

      table.string('repse_specialized_service_name', 150).notNullable()
      table.text('repse_specialized_service_object_description').notNullable()
      table
        .string('repse_specialized_service_status', 20)
        .notNullable()
        .defaultTo('active')

      table
        .timestamp('repse_specialized_service_created_at')
        .notNullable()
        .defaultTo(this.now())
      table.timestamp('repse_specialized_service_updated_at').nullable()
      table.timestamp('repse_specialized_service_deleted_at').nullable().defaultTo(null)

      table.index(
        ['repse_registration_id', 'repse_specialized_service_deleted_at'],
        'idx_repse_specialized_services_registration'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
