import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1787433076993 — Baja lógica de las cinco casillas de permiso del módulo
 * Empleados que ninguna operación del API exigía.
 *
 * El catálogo tipado dejó de declararlas (`employees_permission_catalog.ts`);
 * sin esta baja sus filas quedarían vivas en `system_permissions` sin
 * declaración que las respalde y `permissions:check-consistency` saldría con
 * exitCode = 1. Se marcan, no se borran: `role_system_permissions` tiene FK a
 * `system_permissions`, la baja sobrevive a `db:seed`
 * (`SystemPermissionCatalogSyncService.ensureAction` busca `.withTrashed()`)
 * y la evidencia de qué tenía concedido cada rol se conserva.
 *
 * Cero pérdida de capacidad: la edición de esas secciones la deciden
 * `register-physical-consent` y `manage-responsible-edit` ∨
 * `manage-assigned-edit`, que no se tocan aquí.
 *
 * Idempotente en las dos direcciones: el filtro `IS NULL` de `up()` hace que
 * una segunda corrida no toque nada, y la condición `= RETIRED_AT` de
 * `down()` hace que una segunda reversión tampoco. Esa condición es además lo
 * que impide revivir una fila que ya estaba dada de baja por otro motivo
 * antes de esta migración: por eso la marca es una constante literal del
 * archivo y no un `NOW()` evaluado dos veces.
 */
const RETIRED_SLUGS = [
  'tab-consentimiento-write',
  'tab-responsable-write',
  'tab-responsable-delete',
  'tab-asignados-write',
  'tab-asignados-delete',
] as const

/** Marca única de la corrida: `down()` revive exactamente lo que dio de baja `up()`. */
const RETIRED_AT = '2026-08-28 00:00:00'

const SLUG_PLACEHOLDERS = RETIRED_SLUGS.map(() => '?').join(', ')

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      // Si la instalación no tiene el módulo `employees`, el JOIN no resuelve
      // ninguna fila y la migración termina sin hacer nada ni fallar.
      await db.rawQuery(
        `UPDATE \`system_permissions\` AS \`sp\`
         INNER JOIN \`system_modules\` AS \`sm\`
           ON \`sp\`.\`system_module_id\` = \`sm\`.\`system_module_id\`
         SET \`sp\`.\`system_permission_deleted_at\` = ?
         WHERE \`sm\`.\`system_module_slug\` = 'employees'
           AND \`sm\`.\`system_module_deleted_at\` IS NULL
           AND \`sp\`.\`system_permission_slug\` IN (${SLUG_PLACEHOLDERS})
           AND \`sp\`.\`system_permission_deleted_at\` IS NULL`,
        [RETIRED_AT, ...RETIRED_SLUGS]
      )

      // Solo las concesiones de las filas que acaba de marcar el UPDATE de
      // arriba: `sp.system_permission_deleted_at = RETIRED_AT` las identifica
      // sin necesidad de arrastrar ids entre consultas, y deja fuera las de
      // cualquier fila dada de baja antes por otro motivo.
      await db.rawQuery(
        `UPDATE \`role_system_permissions\` AS \`rsp\`
         INNER JOIN \`system_permissions\` AS \`sp\`
           ON \`rsp\`.\`system_permission_id\` = \`sp\`.\`system_permission_id\`
         SET \`rsp\`.\`role_system_permission_deleted_at\` = ?
         WHERE \`sp\`.\`system_permission_deleted_at\` = ?
           AND \`sp\`.\`system_permission_slug\` IN (${SLUG_PLACEHOLDERS})
           AND \`rsp\`.\`role_system_permission_deleted_at\` IS NULL`,
        [RETIRED_AT, RETIRED_AT, ...RETIRED_SLUGS]
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`role_system_permissions\` AS \`rsp\`
         INNER JOIN \`system_permissions\` AS \`sp\`
           ON \`rsp\`.\`system_permission_id\` = \`sp\`.\`system_permission_id\`
         SET \`rsp\`.\`role_system_permission_deleted_at\` = NULL
         WHERE \`rsp\`.\`role_system_permission_deleted_at\` = ?
           AND \`sp\`.\`system_permission_slug\` IN (${SLUG_PLACEHOLDERS})`,
        [RETIRED_AT, ...RETIRED_SLUGS]
      )

      await db.rawQuery(
        `UPDATE \`system_permissions\`
         SET \`system_permission_deleted_at\` = NULL
         WHERE \`system_permission_deleted_at\` = ?
           AND \`system_permission_slug\` IN (${SLUG_PLACEHOLDERS})`,
        [RETIRED_AT, ...RETIRED_SLUGS]
      )
    })
  }
}
