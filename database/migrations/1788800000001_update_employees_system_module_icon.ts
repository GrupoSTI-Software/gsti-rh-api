import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Cambia el icono del módulo "Empleados" (`/employees`) por el `users` de
 * Tabler (dos personas): el anterior era `user-cog`, que sugiere configuración
 * de cuenta y no un padrón de personal.
 *
 * SOLO DML e idempotente: actualiza por slug, nunca por id (R3 de
 * USRH1788282413204). Correr dos veces deja el mismo resultado.
 *
 * `down()` regresa el icono anterior solo si el actual sigue siendo el que
 * puso esta migración, para no pisar un cambio posterior hecho a mano.
 */
const MODULE_SLUG = 'employees'

const NEW_ICON = `<svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
          <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
        </svg>`

const PREVIOUS_ICON = `<svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
          <path d="M6 21v-2a4 4 0 0 1 4 -4h2.5" />
          <path d="M19.001 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
          <path d="M19.001 15.5v1.5" />
          <path d="M19.001 21v1.5" />
          <path d="M22.032 17.25l-1.299 .75" />
          <path d="M17.27 20l-1.3 .75" />
          <path d="M15.97 17.25l1.3 .75" />
          <path d="M20.733 20l1.3 .75" />
        </svg>`

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`system_modules\`
         SET \`system_module_icon\` = ?
         WHERE \`system_module_slug\` = ?
           AND \`system_module_deleted_at\` IS NULL`,
        [NEW_ICON, MODULE_SLUG]
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`system_modules\`
         SET \`system_module_icon\` = ?
         WHERE \`system_module_slug\` = ?
           AND \`system_module_icon\` = ?
           AND \`system_module_deleted_at\` IS NULL`,
        [PREVIOUS_ICON, MODULE_SLUG, NEW_ICON]
      )
    })
  }
}
