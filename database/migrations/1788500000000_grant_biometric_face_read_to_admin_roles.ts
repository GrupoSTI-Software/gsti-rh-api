import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Cierre del acceso cruzado a la foto biométrica del colaborador.
 *
 * NO-OP HISTÓRICO. Esta migración concedía `tab-biometricos-read` a roles
 * administrativos y, de paso, creaba el rol `kiosco` si no existía. Las
 * migraciones ya no siembran catálogo: en este punto de la secuencia
 * `system_permissions` no tiene la fila `tab-biometricos-read` para conceder
 * (la siembra `0062_system_module_seeder` al final), así que la concesión ya
 * no tiene sentido aquí.
 *
 * ATENCIÓN: el alta del rol `kiosco` vivía SOLO en esta migración y no se
 * reproduce en ningún otro lado. `0006_role_seeder` siembra únicamente `root`;
 * si `kiosco` sigue haciendo falta, se resuelve junto con el rediseño de roles
 * por empresa, pendiente de decisión, y no en seeders ni en migraciones.
 *
 * No se renombra ni se borra (regla de migraciones ya mergeadas: el nombre es
 * la clave que Lucid usa en `adonis_schema`); se vacía para no dejar un
 * `INSERT` de catálogo con reversa simétrica que ya no tiene sentido.
 */
export default class extends BaseSchema {
  async up() {}

  async down() {}
}
