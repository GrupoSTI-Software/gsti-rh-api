import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1784573245783 — Curación única de `system_modules.system_module_active`.
 *
 * NO-OP HISTÓRICO. Esta migración curaba `system_module_active` a partir del
 * pivote `system_setting_system_modules` que traía cada tenant migrado desde
 * el sistema anterior. Las migraciones ya no siembran catálogo: en este punto
 * de la secuencia `system_modules` tiene 0 filas que curar, y el catálogo (con
 * `systemModuleActive`) lo siembran `0061`/`0062` desde
 * `system_modules.constant.ts`.
 *
 * No se renombra ni se borra (regla de migraciones ya mergeadas: el nombre es
 * la clave que Lucid usa en `adonis_schema`); se vacía para no dejar un
 * `UPDATE` de catálogo con reversa simétrica que ya no tiene sentido y que
 * confundía sobre dónde vive el dato real.
 */
export default class extends BaseSchema {
  async up() {}

  async down() {}
}
