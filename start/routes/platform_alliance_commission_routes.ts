import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas de comisiones devengadas de alianza (USRH1789529505468).
 *
 * Protegida por `auth` + `platformAdmin` en el grupo — dato comercial de
 * plataforma, sin scope de tenant. Prefijo: /api/platform
 *
 *   GET  /api/platform/alliances/:allianceId/commissions → listado + totales
 *
 * Archivo nuevo, un solo `.use()`. No agrega rutas a
 * `platform_alliance_routes.ts` ni a `platform_alliance_attribution_routes.ts`.
 */
router
  .group(() => {
    router.get(
      '/alliances/:allianceId/commissions',
      '#controllers/alliance_commission_controller.index'
    )
  })
  .prefix('/api/platform')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
