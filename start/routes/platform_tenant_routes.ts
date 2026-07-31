import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * ─── Tenants de plataforma (USRH1784574994924) ──────────────────────────────
 *   Solo lectura — ningún endpoint de escritura.
 *
 *   GET  /api/platform/tenants         → listado paginado + filtros search/status
 *   GET  /api/platform/tenants/:id     → detalle por businessUnitPublicId
 *
 *   Ambos tras guard platformAdmin (auth + is_platform_admin).
 */
router
  .group(() => {
    router.get('/', '#controllers/platform_tenant_controller.index')
    router.get('/:id', '#controllers/platform_tenant_controller.show')
  })
  .prefix('/api/platform/tenants')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
