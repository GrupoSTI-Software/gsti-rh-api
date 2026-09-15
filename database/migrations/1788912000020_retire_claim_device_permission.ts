import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Retira `claim-device` del módulo de puntos de acceso.
 *
 * NO-OP HISTÓRICO. Esta migración daba de baja lógica un permiso y sus
 * concesiones, asumiendo vivas las filas de `system_permissions`/
 * `role_system_permissions`. Bajo el modelo nuevo (USRH — catálogo nace
 * vacío tras `migration:fresh --seed`) esas filas no existen en este punto de
 * la secuencia, así que la baja ya no tiene sentido aquí.
 *
 * No se renombra ni se borra (regla de migraciones ya mergeadas: el nombre es
 * la clave que Lucid usa en `adonis_schema`); se vacía para no dejar un
 * `UPDATE` de catálogo que ya no tiene sentido.
 */
export default class extends BaseSchema {
  async up() {}

  async down() {}
}
