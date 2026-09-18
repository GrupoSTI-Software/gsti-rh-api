import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Permisos nuevos del módulo `puntos-de-acceso`, hoy `biometric-devices`
 * (spec ADMS 12).
 *
 * NO-OP HISTÓRICO. Esta migración insertaba permisos y concesiones espejo
 * sobre un módulo que asumía vivo en `system_modules`. Las migraciones ya no
 * siembran catálogo y ese módulo no existe en este punto de la secuencia, así
 * que el alta ya no tiene sentido aquí. Hoy los permisos se declaran en
 * `ACCESS_POINT_PERMISSION_CATALOG`, referenciado por
 * `system_modules.constant.ts`, y los siembra `0062_system_module_seeder`; la
 * concesión espejo no la replica ningún seeder.
 *
 * No se renombra ni se borra (regla de migraciones ya mergeadas: el nombre es
 * la clave que Lucid usa en `adonis_schema`); se vacía para no dejar un
 * `INSERT` de catálogo con reversa simétrica que ya no tiene sentido.
 */
export default class extends BaseSchema {
  async up() {}

  async down() {}
}
