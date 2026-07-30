import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1784573245783 — Curación única de `system_modules.system_module_active`.
 *
 * La disponibilidad de módulos pasa de ser per-tenant (pivote
 * `system_setting_system_modules`) a global (`system_module_active`). Esta
 * migración fija el estado inicial (regla 4 de la HU): queda encendido todo
 * módulo que al menos un cliente tiene marcado hoy en el pivote vivo; el resto
 * arranca apagado. No borra datos: el pivote se conserva intacto (lo retira la
 * HU hermana USRH1784573246787).
 *
 * Idempotente: son UPDATE con filtro por pertenencia al pivote; re-ejecutar no
 * cambia el resultado.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      // Encender los módulos presentes en al menos un ajuste vivo del pivote.
      await db.rawQuery(
        `UPDATE system_modules
         SET system_module_active = 1
         WHERE system_module_id IN (
           SELECT DISTINCT system_module_id
           FROM system_setting_system_modules
           WHERE system_setting_system_module_deleted_at IS NULL
         )`
      )

      // Apagar los que ningún cliente usa hoy.
      await db.rawQuery(
        `UPDATE system_modules
         SET system_module_active = 0
         WHERE system_module_id NOT IN (
           SELECT DISTINCT system_module_id
           FROM system_setting_system_modules
           WHERE system_setting_system_module_deleted_at IS NULL
         )`
      )
    })
  }

  async down() {
    // Reversa aproximada: sin snapshot del estado previo, se reactivan todos
    // los módulos (comportamiento histórico donde la columna era inerte en 1).
    this.defer(async (db) => {
      await db.rawQuery('UPDATE system_modules SET system_module_active = 1')
    })
  }
}
