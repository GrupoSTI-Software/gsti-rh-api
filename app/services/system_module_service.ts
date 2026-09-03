import SystemModule from '#models/system_module'
import SystemModuleGroup from '#models/system_module_group'
import { SystemModuleFilterSearchInterface } from '../interfaces/system.module_filter_search_interface.js'

export default class SystemModuleService {
  async index(filters: SystemModuleFilterSearchInterface) {
    const systemModules = await SystemModule.query()
      .select('system_modules.*')
      .leftJoin('system_module_groups as g', (join) => {
        join
          .on('g.system_module_group_id', 'system_modules.system_module_group_id')
          .andOnNull('g.system_module_group_deleted_at')
      })
      .preload('systemModuleGroup', (q) => q.whereNull('system_module_group_deleted_at'))
      .preload('systemPermissions')
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(system_modules.system_module_name) LIKE ?', [
          `%${filters.search.toUpperCase()}%`,
        ])
      })
      .orderByRaw('COALESCE(g.system_module_group_order, system_modules.system_module_order) ASC')
      .orderBy('system_modules.system_module_order', 'asc')
      .orderBy('system_modules.system_module_id', 'asc')
      .paginate(filters.page, filters.limit)
    return systemModules
  }

  async show(systemModuleSlug: string) {
    const systemModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', systemModuleSlug)
      .preload('systemPermissions')
      .first()
    return systemModule ? systemModule : null
  }

  async getGroups() {
    return SystemModuleGroup.query()
      .whereNull('system_module_group_deleted_at')
      .orderBy('system_module_group_order', 'asc')
      .orderBy('system_module_group_id', 'asc')
  }
}
