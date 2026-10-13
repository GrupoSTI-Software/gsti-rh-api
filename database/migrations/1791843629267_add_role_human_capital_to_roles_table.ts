import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Marca "Recursos Humanos" del rol. Nace apagada. Los roles vivos cuyo
 * nombre interno ya es el de RH quedan encendidos una sola vez: el resto
 * del sistema deja de adivinar la función por el nombre.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('roles', (table) => {
      table.boolean('role_human_capital').notNullable().defaultTo(false).after('role_management_days')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE roles SET role_human_capital = 1
          WHERE role_deleted_at IS NULL
            AND REPLACE(LOWER(TRIM(role_slug)), ' ', '-') IN ('rh-manager', 'recursos-humanos')`
      )
    })
  }

  async down() {
    this.schema.alterTable('roles', (table) => {
      table.dropColumn('role_human_capital')
    })
  }
}
