import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Permisos nuevos del modulo existente `puntos-de-acceso` (spec ADMS 12).
 * SOLO DML e idempotente por slug; sin INSERT de modulo.
 *
 * Concesion espejo: `read` del modulo a `read-health`; `update` a
 * `reset-upload-progress`, `manage-commands` y `reconcile-pins`;
 * `claim-device` solo a `super-administrador` y `rh-manager` (decision de
 * Wilvardo 2026-09-07, revisable). Si el modulo no existe en la instalacion
 * los JOIN no resuelven filas y la migracion termina sin hacer nada.
 *
 * `down()` retira exactamente lo que creo esta corrida, por marca literal.
 */
const MODULE_SLUG = 'puntos-de-acceso'
const CREATED_AT = '2026-09-07 00:00:00'

const PERMISSIONS = [
  { name: 'Ver salud de dispositivos', slug: 'read-health', mirror: ['read'] },
  { name: 'Reclamar dispositivo en cuarentena', slug: 'claim-device', mirror: [] },
  { name: 'Reiniciar avance de subida', slug: 'reset-upload-progress', mirror: ['update'] },
  { name: 'Gestionar comandos', slug: 'manage-commands', mirror: ['update'] },
  { name: 'Conciliar PINs', slug: 'reconcile-pins', mirror: ['update'] },
] as const

const CLAIM_DEVICE_ROLE_SLUGS = ['super-administrador', 'rh-manager'] as const

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
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

        for (const sourceSlug of permission.mirror) {
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
             INNER JOIN \`system_modules\` AS \`sm\`
               ON \`sm\`.\`system_module_id\` = \`source\`.\`system_module_id\`
              AND \`sm\`.\`system_module_slug\` = ?
              AND \`sm\`.\`system_module_deleted_at\` IS NULL
             INNER JOIN \`system_permissions\` AS \`target\`
               ON \`target\`.\`system_module_id\` = \`sm\`.\`system_module_id\`
              AND \`target\`.\`system_permission_slug\` = ?
              AND \`target\`.\`system_permission_deleted_at\` IS NULL
             WHERE \`rsp\`.\`role_system_permission_deleted_at\` IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM \`role_system_permissions\` AS \`existente\`
                 WHERE \`existente\`.\`role_id\` = \`rsp\`.\`role_id\`
                   AND \`existente\`.\`system_permission_id\` = \`target\`.\`system_permission_id\`
                   AND \`existente\`.\`role_system_permission_deleted_at\` IS NULL
               )`,
            [CREATED_AT, CREATED_AT, sourceSlug, MODULE_SLUG, permission.slug]
          )
        }
      }

      const rolePlaceholders = CLAIM_DEVICE_ROLE_SLUGS.map(() => '?').join(', ')
      await db.rawQuery(
        `INSERT INTO \`role_system_permissions\`
           (\`role_id\`, \`system_permission_id\`,
            \`role_system_permission_created_at\`, \`role_system_permission_updated_at\`)
         SELECT \`r\`.\`role_id\`, \`sp\`.\`system_permission_id\`, ?, ?
         FROM \`roles\` AS \`r\`
         INNER JOIN \`system_modules\` AS \`sm\`
           ON \`sm\`.\`system_module_slug\` = ?
          AND \`sm\`.\`system_module_deleted_at\` IS NULL
         INNER JOIN \`system_permissions\` AS \`sp\`
           ON \`sp\`.\`system_module_id\` = \`sm\`.\`system_module_id\`
          AND \`sp\`.\`system_permission_slug\` = 'claim-device'
          AND \`sp\`.\`system_permission_deleted_at\` IS NULL
         WHERE \`r\`.\`role_slug\` IN (${rolePlaceholders})
           AND \`r\`.\`role_deleted_at\` IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM \`role_system_permissions\` AS \`existente\`
             WHERE \`existente\`.\`role_id\` = \`r\`.\`role_id\`
               AND \`existente\`.\`system_permission_id\` = \`sp\`.\`system_permission_id\`
               AND \`existente\`.\`role_system_permission_deleted_at\` IS NULL
           )`,
        [CREATED_AT, CREATED_AT, MODULE_SLUG, ...CLAIM_DEVICE_ROLE_SLUGS]
      )
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
    })
  }
}
