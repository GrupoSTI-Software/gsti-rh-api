import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Avisos y noticias v2, segunda entrega: pertenencia al público vigente.
 *
 * `syncRecipients` conserva las filas con historial de envío o lectura aunque
 * el criterio nuevo las deje fuera (son seguimiento). Sin una bandera, reenviar
 * tras acotar el público volvía a escribir a toda la lista anterior, y el
 * conteo que confirmaba el backoffice coincidía con ese número.
 *
 * - `1` (valor por defecto): la fila cumple el criterio vigente y recibe los
 *   reenvíos.
 * - `0`: fila histórica fuera del público; conserva su seguimiento pero no
 *   recibe. Volver a entrar al público restaura la bandera.
 *
 * Sin `await` sobre `this.schema`: regla del repo (ver CLAUDE.md).
 */
export default class extends BaseSchema {
  protected tableName = 'notice_recipients'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .boolean('notice_recipient_in_audience')
        .notNullable()
        .defaultTo(true)
        .after('notice_recipient_error')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('notice_recipient_in_audience')
    })
  }
}
