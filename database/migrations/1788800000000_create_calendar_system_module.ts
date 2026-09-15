import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Módulo "Calendario" (`/calendar`).
 *
 * NO-OP HISTÓRICO. Esta migración insertaba el módulo `calendar`, sus cuatro
 * permisos y las concesiones espejo a los roles que ya leían los calendarios
 * de empleados. Bajo el modelo nuevo (USRH — catálogo nace vacío tras
 * `migration:fresh --seed`) el alta de módulos no vive en una migración: el
 * módulo `calendar` se recupera vía `0061_calendar_module_seeder` mientras
 * ese seeder siga vigente, y a futuro vía el flujo de siembra que sustituya
 * al catálogo actual.
 *
 * No se renombra ni se borra (regla de migraciones ya mergeadas: el nombre es
 * la clave que Lucid usa en `adonis_schema`); se vacía para no dejar un
 * `INSERT` de catálogo con reversa simétrica que ya no tiene sentido.
 */
export default class extends BaseSchema {
  async up() {}

  async down() {}
}
