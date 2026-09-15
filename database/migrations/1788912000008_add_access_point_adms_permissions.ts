import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Permisos nuevos del módulo `puntos-de-acceso` (spec ADMS 12).
 *
 * NO-OP HISTÓRICO. Esta migración insertaba permisos y concesiones espejo
 * sobre un módulo que asumía vivo en `system_modules`. Bajo el modelo nuevo
 * (USRH — catálogo nace vacío tras `migration:fresh --seed`) ese módulo no
 * existe en este punto de la secuencia, así que el alta ya no tiene sentido
 * aquí. Estos permisos se declaran donde se declare el módulo mismo (seeder
 * o el flujo de siembra que lo sustituya).
 *
 * No se renombra ni se borra (regla de migraciones ya mergeadas: el nombre es
 * la clave que Lucid usa en `adonis_schema`); se vacía para no dejar un
 * `INSERT` de catálogo con reversa simétrica que ya no tiene sentido.
 */
export default class extends BaseSchema {
  async up() {}

  async down() {}
}
