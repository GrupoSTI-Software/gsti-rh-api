import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * ─── Tenants de plataforma ────────────────────────────────────────────────────
 *   GET  /api/platform/tenants              → listado paginado + filtros
 *   GET  /api/platform/tenants/:id          → detalle por businessUnitPublicId
 *   PUT  /api/platform/tenants/:id/biometrics → encender/apagar biométricos
 *
 *   Todos tras guard platformAdmin (auth + is_platform_admin).
 *   Refs: USRH1784574994924, USRH1787189981872.
 */
router
  .group(() => {
    router.get('/', '#controllers/platform_tenant_controller.index')
    router.get('/:id', '#controllers/platform_tenant_controller.show')
    router.put('/:id/biometrics', '#controllers/platform_tenant_controller.updateBiometrics')
  })
  .prefix('/api/platform/tenants')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
