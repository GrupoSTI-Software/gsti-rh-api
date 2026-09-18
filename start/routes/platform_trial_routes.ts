import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * ─── Prueba de tenants de plataforma (USRH1789079078169) ──────────────────────
 *   GET /api/platform/metrics/tenants/:publicId/trial → ventana y estado de la prueba
 *
 * Tras guard platformAdmin (auth + is_platform_admin), a nivel de grupo y en
 * ese orden — molde `platform_subscription_flow_routes.ts:19`.
 *
 * Sin `businessScope()`: exige el header `X-Business-Unit-Id` y respondería
 * 400 `BU.VAL.000` si falta, pero esta consulta resuelve el tenant desde el
 * segmento de ruta `:publicId`, no desde el header — mismo criterio que
 * `platform_device_discrepancy_routes.ts:12-13`.
 */
router
  .group(() => {
    router.get('/tenants/:publicId/trial', '#controllers/platform_trial_controller.show')
  })
  .prefix('/api/platform/metrics')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
