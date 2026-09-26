import SystemModule from '#models/system_module'

/**
 * Servicio de plataforma de solo lectura sobre el catálogo de módulos del
 * sistema. No escribe `system_module_active`: la disponibilidad la gobierna
 * `system_modules.constant.ts` y la siembra 0062 la sobrescribe en cada corrida.
 *
 * Separado del `SystemModuleService` de tenant (que alimenta el menú del BO)
 * para no acoplar la vista global con el consumo per-tenant.
 */
export default class PlatformSystemModuleService {
  /**
   * Lista todos los módulos del sistema, incluidos los inactivos.
   * Excluye los módulos con baja lógica (`system_module_deleted_at IS NOT NULL`).
   *
   * El orden es clusterizado (R9): grupos en el orden del catálogo, apartados
   * dentro del suyo por `system_module_order`, y todos los módulos sueltos
   * (sin grupo activo) juntos al final en un único bloque contiguo.
   * PrimeVue `row-group-mode="subheader"` emite un encabezado cada vez que
   * cambia el valor de agrupación: si los sueltos se intercalaran entre grupos,
   * el encabezado "sin grupo" aparecería más de una vez.
   *
   * El grupo viaja anidado porque el panel de plataforma no consulta la ruta
   * de catálogo `/api/system-modules/get-groups` (§9.4 USRH1788282413110).
   *
   * @returns Catálogo completo de módulos con su grupo anidado, en orden clusterizado.
   */
  async listAll(): Promise<SystemModule[]> {
    return SystemModule.query()
      .select('system_modules.*')
      .leftJoin('system_module_groups as g', (join) => {
        join
          .on('g.system_module_group_id', 'system_modules.system_module_group_id')
          .andOnNull('g.system_module_group_deleted_at')
      })
      .whereNull('system_module_deleted_at')
      .preload('systemModuleGroup', (q) => q.whereNull('system_module_group_deleted_at'))
      .orderByRaw('(g.system_module_group_order IS NULL) ASC')
      .orderByRaw('g.system_module_group_order ASC')
      .orderBy('system_modules.system_module_order', 'asc')
      .orderBy('system_modules.system_module_id', 'asc')
  }
}
