import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas de atribución alianza↔cliente (USRH1789099318034).
 *
 * Todas protegidas por `auth` + `platformAdmin` en el grupo — dato de
 * plataforma, sin scope de tenant. Prefijo: /api/platform
 *
 *   POST   /api/platform/alliance-attributions
 *   GET    /api/platform/alliance-attributions/:allianceAttributionId
 *   GET    /api/platform/tenants/:businessUnitPublicId/alliance-attributions
 *   PATCH  /api/platform/alliance-attributions/:allianceAttributionId
 *   POST   /api/platform/alliance-attributions/:allianceAttributionId/close
 *
 * La tercera vive bajo /tenants pero se declara aquí. Ver la referencia
 * cruzada en `platform_tenant_routes.ts`.
 */
router
  .group(() => {
    router.post(
      '/alliance-attributions',
      '#controllers/alliance_attribution_controller.store'
    )
    router.get(
      '/alliance-attributions/:allianceAttributionId',
      '#controllers/alliance_attribution_controller.show'
    )
    router.get(
      '/tenants/:businessUnitPublicId/alliance-attributions',
      '#controllers/alliance_attribution_controller.indexByTenant'
    )
    router.patch(
      '/alliance-attributions/:allianceAttributionId',
      '#controllers/alliance_attribution_controller.update'
    )
    router.post(
      '/alliance-attributions/:allianceAttributionId/close',
      '#controllers/alliance_attribution_controller.close'
    )
  })
  .prefix('/api/platform')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
