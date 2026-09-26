import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Código de verificación del gafete del trabajador (USRH1784686362321).
 *
 * Columna única por empleado, generada de forma perezosa al primer gafete
 * (`badge.service.ts`). No es filtered-unique: un token de un empleado dado
 * de baja jamás se reasigna (anti-suplantación) — a diferencia del patrón
 * de `repse_registrations`, donde el filtered-unique existe para REUTILIZAR
 * folios tras el soft delete.
 */
export default class extends BaseSchema {
  protected tableName = 'employees'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('employee_badge_token', 64)
        .after('employee_photo')
        .nullable()
        .defaultTo(null)
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.unique(['employee_badge_token'], {
        indexName: 'employees_employee_badge_token_unique',
      })
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['employee_badge_token'], 'employees_employee_badge_token_unique')
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_badge_token')
    })
  }
}
