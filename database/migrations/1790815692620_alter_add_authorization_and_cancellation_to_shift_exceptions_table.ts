import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Quién autorizó cada día, de qué solicitud salió y, si se canceló, quién,
 * cuándo y por qué.
 *
 * Hasta ahora un día de vacaciones existía o no: autorizarlo desde la bandeja
 * no lo ligaba a su solicitud, autorizarlo con firma no guardaba quién, y
 * cancelarlo lo borraba sin motivo. La cancelación sigue siendo el borrado
 * lógico de siempre --todo lo que cuenta saldo y asistencia ya excluye esas
 * filas--; estas columnas solo dejan el rastro para poder mostrarla.
 *
 * El relleno liga los días que se firmaron (única vía que guardaba el vínculo)
 * y toma de su solicitud quién la resolvió, cuando lo hay.
 */
export default class extends BaseSchema {
  protected tableName = 'shift_exceptions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('exception_request_id')
        .unsigned()
        .nullable()
        .after('vacation_setting_id')
        .references('exception_request_id')
        .inTable('exception_requests')
        .onDelete('SET NULL')
      table.integer('shift_exception_authorized_by_user_id').unsigned().nullable()
      table.timestamp('shift_exception_authorized_at').nullable()
      table.integer('shift_exception_cancelled_by_user_id').unsigned().nullable()
      table.timestamp('shift_exception_cancelled_at').nullable()
      table.string('shift_exception_cancel_reason', 500).nullable()
    })

    this.schema.raw(`
      UPDATE shift_exceptions se
      JOIN vacation_authorization_signatures vas
        ON vas.shift_exception_id = se.shift_exception_id
      SET se.exception_request_id = vas.exception_request_id,
          se.shift_exception_authorized_at = vas.vacation_authorization_signature_created_at
      WHERE vas.exception_request_id IS NOT NULL
        AND se.exception_request_id IS NULL
    `)

    this.schema.raw(`
      UPDATE shift_exceptions se
      JOIN exception_requests er
        ON er.exception_request_id = se.exception_request_id
      SET se.shift_exception_authorized_by_user_id = er.resolved_by_user_id,
          se.shift_exception_authorized_at = COALESCE(er.exception_request_resolved_at, se.shift_exception_authorized_at)
      WHERE er.resolved_by_user_id IS NOT NULL
    `)
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['exception_request_id'])
      table.dropColumn('exception_request_id')
      table.dropColumn('shift_exception_authorized_by_user_id')
      table.dropColumn('shift_exception_authorized_at')
      table.dropColumn('shift_exception_cancelled_by_user_id')
      table.dropColumn('shift_exception_cancelled_at')
      table.dropColumn('shift_exception_cancel_reason')
    })
  }
}
