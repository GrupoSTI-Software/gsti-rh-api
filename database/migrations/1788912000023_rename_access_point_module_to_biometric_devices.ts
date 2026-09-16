import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Renombra el módulo `puntos-de-acceso` a `biometric-devices`.
 *
 * NO-OP HISTÓRICO. Esta migración hacía `UPDATE` de slug/nombre/ruta sobre
 * una fila que asumía viva en `system_modules` (id 33 en las instalaciones
 * donde corrió). Las migraciones ya no siembran catálogo y esa fila no existe
 * en este punto de la secuencia, así que el `UPDATE` ya no tiene sentido aquí.
 * El slug, nombre y ruta vigentes (`biometric-devices`) se declaran en
 * `system_modules.constant.ts`.
 *
 * No se renombra ni se borra (regla de migraciones ya mergeadas: el nombre es
 * la clave que Lucid usa en `adonis_schema`); se vacía para no dejar un
 * `UPDATE` de catálogo con reversa simétrica que ya no tiene sentido.
 */
export default class extends BaseSchema {
  async up() {}

  async down() {}
}
