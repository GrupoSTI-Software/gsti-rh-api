import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Módulo "Calendario" (`/calendar`).
 *
 * NO-OP HISTÓRICO. Esta migración insertaba el módulo `calendar`, sus cuatro
 * permisos y las concesiones espejo a los roles que ya leían los calendarios
 * de empleados. Las migraciones ya no siembran catálogo: el módulo `calendar`
 * se declara en `app/constants/system_modules_menu/system_modules.constant.ts`
 * y lo siembra `0062_system_module_seeder` al final de `migration:fresh --seed`.
 *
 * No se renombra ni se borra (regla de migraciones ya mergeadas: el nombre es
 * la clave que Lucid usa en `adonis_schema`); se vacía para no dejar un
 * `INSERT` de catálogo con reversa simétrica que ya no tiene sentido.
 */
export default class extends BaseSchema {
  async up() {}

  async down() {}
}
