import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1784573245783 — Curación única de `system_modules.system_module_active`.
 *
 * NO-OP HISTÓRICO. Esta migración curaba `system_module_active` a partir del
 * pivote `system_setting_system_modules` que traía cada tenant migrado desde
 * el sistema anterior. Bajo el modelo nuevo (USRH — catálogo nace vacío) no
 * hay filas de `system_modules` que curar: `migration:fresh` deja la tabla en
 * 0 filas y la siembra del catálogo vive en un flujo aparte, todavía por
 * construir.
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
