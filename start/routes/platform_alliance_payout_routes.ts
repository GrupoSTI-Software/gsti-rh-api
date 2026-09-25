import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas de liquidaciones de alianza (USRH1787719056820 · USRH1787719056821).
 *
 * Protegida por `auth` + `platformAdmin` en el grupo — dato comercial de
 * plataforma, sin scope de tenant. Prefijo: /api/platform
 *
 *   POST /api/platform/alliances/:allianceId/payouts → registrar liquidación
 *   GET  /api/platform/alliances/:allianceId/payouts → historial paginado
 *   GET  /api/platform/alliance-payouts/:alliancePayoutId → rastro de una liquidación
 *   POST /api/platform/alliance-payouts/:alliancePayoutId/annul → anular liquidación
 *
 * Archivo propio, un solo `.use()`. No agrega rutas a
 * `platform_alliance_routes.ts` ni a `platform_alliance_commission_routes.ts`.
 */
router
  .group(() => {
    router.post(
      '/alliances/:allianceId/payouts',
      '#controllers/alliance_payout_controller.store'
    )
    router.get(
      '/alliances/:allianceId/payouts',
      '#controllers/alliance_payout_controller.index'
    )
    router.get(
      '/alliance-payouts/:alliancePayoutId',
      '#controllers/alliance_payout_controller.show'
    )
    router.post(
      '/alliance-payouts/:alliancePayoutId/annul',
      '#controllers/alliance_payout_controller.annul'
    )
  })
  .prefix('/api/platform')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
