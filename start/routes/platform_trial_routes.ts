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
    // USRH1789079078171: frecuencia de registro de la prueba, con su serie diaria.
    router.get(
      '/tenants/:publicId/trial/usage',
      '#controllers/platform_trial_usage_controller.show'
    )
    // USRH1789079078173: listado de TODAS las pruebas vivas, con hitos y frecuencia.
    // Fuera de /tenants/:publicId — no es de una empresa, es del universo completo.
    router.get('/trials/live', '#controllers/platform_live_trials_controller.index')
  })
  .prefix('/api/platform/metrics')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
