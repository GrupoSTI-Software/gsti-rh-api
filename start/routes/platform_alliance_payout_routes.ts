import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas de liquidaciones de alianza (USRH1787719056820).
 *
 * Protegida por `auth` + `platformAdmin` en el grupo — dato comercial de
 * plataforma, sin scope de tenant. Prefijo: /api/platform
 *
 *   POST /api/platform/alliances/:allianceId/payouts → registrar liquidación
 *
 * Archivo nuevo, un solo `.use()`. No agrega rutas a
 * `platform_alliance_routes.ts` ni a `platform_alliance_commission_routes.ts`.
 */
router
  .group(() => {
    router.post(
      '/alliances/:allianceId/payouts',
      '#controllers/alliance_payout_controller.store'
    )
  })
  .prefix('/api/platform')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
