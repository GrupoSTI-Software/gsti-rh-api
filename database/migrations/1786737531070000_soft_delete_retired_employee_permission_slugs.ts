import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1787433076993 — Baja lógica de cinco permisos del módulo Empleados.
 *
 * NO-OP HISTÓRICO. Esta migración daba de baja lógica filas de
 * `system_permissions`/`role_system_permissions` que solo existían porque el
 * catálogo se sembraba desde migraciones/seeders. Bajo el modelo nuevo
 * (USRH — catálogo nace vacío tras `migration:fresh --seed`) esas filas nunca
 * se crean, así que no hay nada que retirar.
 *
 * No se renombra ni se borra (regla de migraciones ya mergeadas: el nombre es
 * la clave que Lucid usa en `adonis_schema`); se vacía para no dejar un
 * `UPDATE` de catálogo con reversa simétrica que ya no tiene sentido.
 */
export default class extends BaseSchema {
  async up() {}

  async down() {}
}
