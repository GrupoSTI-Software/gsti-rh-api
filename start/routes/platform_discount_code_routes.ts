import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas del catálogo de códigos de descuento (USRH1787714804397).
 *
 * Todas protegidas por `auth` + `platformAdmin` — dato de plataforma, sin
 * scope de tenant. Prefijo: /api/platform/billing
 *
 *   GET    /api/platform/billing/discount-codes                → listado paginado
 *   GET    /api/platform/billing/discount-codes/:discountCodeId → detalle
 *   POST   /api/platform/billing/discount-codes                 → alta
 *   PATCH  /api/platform/billing/discount-codes/:discountCodeId → edición (sin el texto)
 *   POST   /api/platform/billing/discount-codes/:discountCodeId/activate   → reactivar
 *   POST   /api/platform/billing/discount-codes/:discountCodeId/deactivate → apagar
 */
router
  .group(() => {
    router.get('/discount-codes', '#controllers/discount_code_controller.index')
    router.get(
      '/discount-codes/:discountCodeId',
      '#controllers/discount_code_controller.show'
    )
    router.post('/discount-codes', '#controllers/discount_code_controller.store')
    router.patch(
      '/discount-codes/:discountCodeId',
      '#controllers/discount_code_controller.update'
    )
    router.post(
      '/discount-codes/:discountCodeId/activate',
      '#controllers/discount_code_controller.activate'
    )
    router.post(
      '/discount-codes/:discountCodeId/deactivate',
      '#controllers/discount_code_controller.deactivate'
    )
  })
  .prefix('/api/platform/billing')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
