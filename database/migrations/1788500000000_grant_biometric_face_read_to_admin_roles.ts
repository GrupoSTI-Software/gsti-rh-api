import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Cierre del acceso cruzado a la foto biométrica del colaborador.
 *
 * NO-OP HISTÓRICO. Esta migración concedía `tab-biometricos-read` a roles
 * administrativos y, de paso, creaba el rol `kiosco` si no existía. Bajo el
 * modelo nuevo (USRH — catálogo de módulos/permisos nace vacío tras
 * `migration:fresh --seed`) `system_permissions` no tiene la fila
 * `tab-biometricos-read` para conceder, así que la concesión ya no tiene
 * sentido aquí.
 *
 * ATENCIÓN: el alta del rol `kiosco` vivía SOLO en esta migración. Si el rol
 * sigue siendo necesario, hay que declararlo explícitamente en
 * `0006_role_seeder.ts` (por slug, nunca por id) — no se reproduce aquí para
 * no mezclar de nuevo altas de catálogo dentro de una migración.
 *
 * No se renombra ni se borra (regla de migraciones ya mergeadas: el nombre es
 * la clave que Lucid usa en `adonis_schema`); se vacía para no dejar un
 * `INSERT` de catálogo con reversa simétrica que ya no tiene sentido.
 */
export default class extends BaseSchema {
  async up() {}

  async down() {}
}
