import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Módulo "Calendario" (`/calendar`): un solo lugar para festividades,
 * vacaciones, cumpleaños y aniversarios. Los cuatro calendarios anteriores se
 * conservan; este los absorbe sin retirarlos.
 *
 * SOLO DML e idempotente: crea el módulo si no existe, sus cuatro permisos y
 * concede cada permiso a los roles que ya lo tienen en `holidays` (el `read`
 * también a quien lee cualquiera de los tres calendarios de empleados). Así
 * nadie que hoy administra festividades se queda fuera el día del despliegue.
 *
 * Queda suelto en el primer nivel, entre Empleados y Festividades: la decisión
 * del 2026-09-04 dejó el grupo `calendarios` vacío a propósito y no se reabre
 * desde una migración. Identificación por slug, nunca por id (R3 de USRH1788282413204).
 *
 * `down()` retira exactamente lo que creó esta corrida, reconocible por la
 * marca de tiempo literal.
 */
const MODULE_SLUG = 'calendar'
const MODULE_NAME = 'Calendario'
const MODULE_PATH = '/calendar'
const MODULE_ORDER = 25
const CREATED_AT = '2026-09-06 00:00:00'

const PERMISSIONS = [
  { name: 'Read', slug: 'read' },
  { name: 'Create', slug: 'create' },
  { name: 'Update', slug: 'update' },
  { name: 'Delete', slug: 'delete' },
] as const

/** Módulos cuyo `read` habilita ver el calendario unificado. */
const READ_SOURCE_SLUGS = [
  'holidays',
  'vacations-calendar',
  'birthdays-calendar',
  'work-anniversaries-calendar',
] as const

/** Módulo del que se copian create, update y delete (las festividades se editan aquí). */
const WRITE_SOURCE_SLUG = 'holidays'

const MODULE_ICON = `<svg
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
          <path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z" />
          <path d="M16 3v4" />
          <path d="M8 3v4" />
          <path d="M4 11h16" />
          <path d="M7 14h.013" />
          <path d="M10.01 14h.005" />
          <path d="M13.01 14h.005" />
          <path d="M16.015 14h.005" />
          <path d="M13.015 17h.005" />
          <path d="M7.01 17h.005" />
          <path d="M10.01 17h.005" />
        </svg>`

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(
        `INSERT INTO \`system_modules\`
           (\`system_module_name\`, \`system_module_slug\`, \`system_module_description\`,
            \`system_modules\`, \`system_module_path\`, \`system_module_group_id\`,
            \`system_module_order\`, \`system_module_active\`, \`system_module_icon\`,
            \`system_module_created_at\`, \`system_module_updated_at\`)
         SELECT ?, ?, ?, 1, ?, NULL, ?, 1, ?, ?, ?
         FROM DUAL
         WHERE NOT EXISTS (
           SELECT 1 FROM \`system_modules\`
           WHERE \`system_module_slug\` = ? AND \`system_module_deleted_at\` IS NULL
         )`,
        [MODULE_NAME, MODULE_SLUG, MODULE_SLUG, MODULE_PATH, MODULE_ORDER, MODULE_ICON, CREATED_AT, CREATED_AT, MODULE_SLUG]
      )

      for (const permission of PERMISSIONS) {
        await db.rawQuery(
          `INSERT INTO \`system_permissions\`
             (\`system_permission_name\`, \`system_permission_slug\`, \`system_module_id\`,
              \`system_permission_created_at\`, \`system_permission_updated_at\`)
           SELECT ?, ?, \`sm\`.\`system_module_id\`, ?, ?
           FROM \`system_modules\` AS \`sm\`
           WHERE \`sm\`.\`system_module_slug\` = ?
             AND \`sm\`.\`system_module_deleted_at\` IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM \`system_permissions\` AS \`sp\`
               WHERE \`sp\`.\`system_module_id\` = \`sm\`.\`system_module_id\`
                 AND \`sp\`.\`system_permission_slug\` = ?
                 AND \`sp\`.\`system_permission_deleted_at\` IS NULL
             )`,
          [permission.name, permission.slug, CREATED_AT, CREATED_AT, MODULE_SLUG, permission.slug]
        )

        const sourceSlugs: readonly string[] =
          permission.slug === 'read' ? READ_SOURCE_SLUGS : [WRITE_SOURCE_SLUG]
        const placeholders = sourceSlugs.map(() => '?').join(', ')

        // Concesión espejo: cada rol que ya tiene este permiso en el módulo de
        // origen lo recibe en el calendario. Sin origen instalado, el JOIN no
        // resuelve filas y no pasa nada.
        await db.rawQuery(
          `INSERT INTO \`role_system_permissions\`
             (\`role_id\`, \`system_permission_id\`,
              \`role_system_permission_created_at\`, \`role_system_permission_updated_at\`)
           SELECT DISTINCT \`rsp\`.\`role_id\`, \`target\`.\`system_permission_id\`, ?, ?
           FROM \`role_system_permissions\` AS \`rsp\`
           INNER JOIN \`system_permissions\` AS \`source\`
             ON \`source\`.\`system_permission_id\` = \`rsp\`.\`system_permission_id\`
            AND \`source\`.\`system_permission_slug\` = ?
            AND \`source\`.\`system_permission_deleted_at\` IS NULL
           INNER JOIN \`system_modules\` AS \`source_module\`
             ON \`source_module\`.\`system_module_id\` = \`source\`.\`system_module_id\`
            AND \`source_module\`.\`system_module_slug\` IN (${placeholders})
            AND \`source_module\`.\`system_module_deleted_at\` IS NULL
           INNER JOIN \`system_modules\` AS \`target_module\`
             ON \`target_module\`.\`system_module_slug\` = ?
            AND \`target_module\`.\`system_module_deleted_at\` IS NULL
           INNER JOIN \`system_permissions\` AS \`target\`
             ON \`target\`.\`system_module_id\` = \`target_module\`.\`system_module_id\`
            AND \`target\`.\`system_permission_slug\` = ?
            AND \`target\`.\`system_permission_deleted_at\` IS NULL
           WHERE \`rsp\`.\`role_system_permission_deleted_at\` IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM \`role_system_permissions\` AS \`existente\`
               WHERE \`existente\`.\`role_id\` = \`rsp\`.\`role_id\`
                 AND \`existente\`.\`system_permission_id\` = \`target\`.\`system_permission_id\`
                 AND \`existente\`.\`role_system_permission_deleted_at\` IS NULL
             )`,
          [CREATED_AT, CREATED_AT, permission.slug, ...sourceSlugs, MODULE_SLUG, permission.slug]
        )
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(
        `DELETE \`rsp\` FROM \`role_system_permissions\` AS \`rsp\`
         INNER JOIN \`system_permissions\` AS \`sp\`
           ON \`sp\`.\`system_permission_id\` = \`rsp\`.\`system_permission_id\`
         INNER JOIN \`system_modules\` AS \`sm\`
           ON \`sm\`.\`system_module_id\` = \`sp\`.\`system_module_id\`
         WHERE \`sm\`.\`system_module_slug\` = ?
           AND \`rsp\`.\`role_system_permission_created_at\` = ?`,
        [MODULE_SLUG, CREATED_AT]
      )
      await db.rawQuery(
        `DELETE \`sp\` FROM \`system_permissions\` AS \`sp\`
         INNER JOIN \`system_modules\` AS \`sm\`
           ON \`sm\`.\`system_module_id\` = \`sp\`.\`system_module_id\`
         WHERE \`sm\`.\`system_module_slug\` = ?
           AND \`sp\`.\`system_permission_created_at\` = ?`,
        [MODULE_SLUG, CREATED_AT]
      )
      await db.rawQuery(
        `DELETE FROM \`system_modules\`
         WHERE \`system_module_slug\` = ?
           AND \`system_module_created_at\` = ?`,
        [MODULE_SLUG, CREATED_AT]
      )
    })
  }
}
