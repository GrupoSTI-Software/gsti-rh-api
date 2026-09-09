import { BaseSchema } from '@adonisjs/lucid/schema'
import db from '@adonisjs/lucid/services/db'

const MODULE_SLUG = 'puntos-de-acceso'
const PERMISSION_SLUG = 'claim-device'
const RETIRED_AT = '2026-09-08 00:00:00'

/**
 * Retira `claim-device` del modulo de puntos de acceso.
 *
 * Reclamar un checador en cuarentena resulto ser un acto de PLATAFORMA, no de
 * un tenant: el cliente nunca registra sus dispositivos, lo hace GSTI desde el
 * panel interno. Un permiso que ningun endpoint exige es peor que inutil --
 * aparece en la pantalla de roles, alguien lo concede creyendo que habilita
 * algo, y queda una expectativa que el sistema no cumple.
 *
 * Se marca con borrado logico, no se elimina: las concesiones que ya se dieron
 * son evidencia de quien tuvo que permiso y cuando.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async () => {
      await db.rawQuery(
        `UPDATE \`role_system_permissions\` AS \`rsp\`
         INNER JOIN \`system_permissions\` AS \`sp\`
           ON \`sp\`.\`system_permission_id\` = \`rsp\`.\`system_permission_id\`
         INNER JOIN \`system_modules\` AS \`sm\`
           ON \`sm\`.\`system_module_id\` = \`sp\`.\`system_module_id\`
          AND \`sm\`.\`system_module_slug\` = ?
         SET \`rsp\`.\`role_system_permission_deleted_at\` = ?
         WHERE \`sp\`.\`system_permission_slug\` = ?
           AND \`rsp\`.\`role_system_permission_deleted_at\` IS NULL`,
        [MODULE_SLUG, RETIRED_AT, PERMISSION_SLUG]
      )

      await db.rawQuery(
        `UPDATE \`system_permissions\` AS \`sp\`
         INNER JOIN \`system_modules\` AS \`sm\`
           ON \`sm\`.\`system_module_id\` = \`sp\`.\`system_module_id\`
          AND \`sm\`.\`system_module_slug\` = ?
         SET \`sp\`.\`system_permission_deleted_at\` = ?
         WHERE \`sp\`.\`system_permission_slug\` = ?
           AND \`sp\`.\`system_permission_deleted_at\` IS NULL`,
        [MODULE_SLUG, RETIRED_AT, PERMISSION_SLUG]
      )
    })
  }

  /**
   * Revivir el permiso NO devuelve las concesiones: quien lo tenia se decide
   * otra vez a mano. Reponerlas a ciegas le daria el permiso a roles que quiza
   * ya no deberian tenerlo.
   */
  async down() {
    this.defer(async () => {
      await db.rawQuery(
        `UPDATE \`system_permissions\` AS \`sp\`
         INNER JOIN \`system_modules\` AS \`sm\`
           ON \`sm\`.\`system_module_id\` = \`sp\`.\`system_module_id\`
          AND \`sm\`.\`system_module_slug\` = ?
         SET \`sp\`.\`system_permission_deleted_at\` = NULL
         WHERE \`sp\`.\`system_permission_slug\` = ?`,
        [MODULE_SLUG, PERMISSION_SLUG]
      )
    })
  }
}
