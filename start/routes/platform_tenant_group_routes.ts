import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * ─── Grupos de tenants de plataforma ──────────────────────────────────────────
 *   GET    /api/platform/tenant-groups                        → listado paginado + filtros
 *   POST   /api/platform/tenant-groups                        → alta
 *   PUT    /api/platform/tenant-groups/:platformTenantGroupId → renombrar y/o vigencia
 *   DELETE /api/platform/tenant-groups/:platformTenantGroupId → baja lógica + liberación
 *
 * Todos tras guard platformAdmin (auth + is_platform_admin).
 * Ref: USRH1788052455657.
 */
router
  .group(() => {
    router.get('/', '#controllers/platform_tenant_group_controller.index')
    router.post('/', '#controllers/platform_tenant_group_controller.store')
    router
      .put('/:platformTenantGroupId', '#controllers/platform_tenant_group_controller.update')
      .where('platformTenantGroupId', router.matchers.number())
    router
      .delete('/:platformTenantGroupId', '#controllers/platform_tenant_group_controller.destroy')
      .where('platformTenantGroupId', router.matchers.number())
  })
  .prefix('/api/platform/tenant-groups')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
