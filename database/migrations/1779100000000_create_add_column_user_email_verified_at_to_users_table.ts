import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Agrega la columna `user_email_verified_at` a la tabla `users` como soporte
 * para el flujo de signup self-service (verificación por OTP a correo).
 *
 * - Tipo: TIMESTAMP NULL DEFAULT NULL, consistente con la convención del repo.
 * - Posición: justo después de `user_active` para agrupar el estado del usuario.
 * - Backward compatible: queda NULL para todos los usuarios existentes; el flujo
 *   de login actual no la consulta.
 */
export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('user_email_verified_at').nullable().defaultTo(null).after('user_active')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('user_email_verified_at')
    })
  }
}
