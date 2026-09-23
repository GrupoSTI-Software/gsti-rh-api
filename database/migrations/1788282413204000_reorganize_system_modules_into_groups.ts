import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1788282413204 — Organización final de módulos en grupos del menú.
 *
 * NO-OP HISTÓRICO. Esta migración hacía `UPDATE` masivo de
 * `system_module_group_id`/`system_module_order` sobre filas de
 * `system_modules` que asumía ya sembradas, usando listas congeladas
 * (`ORGANIZATION_FINAL`, `GROUP_FINAL`, `PREVIOUS_STATE`, `PREVIOUS_GROUPS`).
 * Las migraciones ya no siembran catálogo y en este punto de la secuencia no
 * hay filas que reorganizar: grupos y orden del menú se declaran en
 * `system_modules.constant.ts` y los siembran `0061_system_module_group_seeder`
 * y `0062_system_module_seeder`.
 *
 * Las constantes que este archivo importaba
 * (`app/constants/system-modules/final_groups_menu.constant.ts`,
 * `final_organization_menu.constant.ts`, `previews_groups_menu.constant.ts`,
 * `previews_organization_menu.constant.ts`) quedaron sin ningún otro
 * consumidor y se movieron a `__TO_DELETE__/` junto con este cambio.
 *
 * No se renombra ni se borra (regla de migraciones ya mergeadas: el nombre es
 * la clave que Lucid usa en `adonis_schema`); se vacía para no dejar un
 * `UPDATE` de catálogo con reversa simétrica que ya no tiene sentido.
 */
export default class extends BaseSchema {
  async up() {}

  async down() {}
}
