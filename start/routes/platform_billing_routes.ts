import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas del catálogo de cobro (planes, precios append-only y tramos).
 *
 * Todas protegidas por `auth` + `platformAdmin` — globales, sin scope de tenant.
 * Prefijo: /api/platform/billing
 *
 * ─── Planes ───────────────────────────────────────────────────────────────
 *   GET    /api/platform/billing/plans                    → listar
 *   GET    /api/platform/billing/plans/:planId            → detalle + precios + tramos
 *   POST   /api/platform/billing/plans                    → crear (borrador)
 *   PATCH  /api/platform/billing/plans/:planId            → editar metadatos
 *   DELETE /api/platform/billing/plans/:planId            → soft-delete
 *   POST   /api/platform/billing/plans/:planId/publish    → publicar (irreversible)
 *   POST   /api/platform/billing/plans/:planId/clone      → clonar como borrador
 *   GET    /api/platform/billing/plans/:planId/resolved-price → precio determinista
 *
 * ─── Precios (append-only) ────────────────────────────────────────────────
 *   GET    /api/platform/billing/plans/:planId/prices     → historial
 *   POST   /api/platform/billing/plans/:planId/prices     → agregar versión
 *
 * ─── Tramos de descuento ──────────────────────────────────────────────────
 *   GET    /api/platform/billing/plans/:planId/tiers              → listar
 *   POST   /api/platform/billing/plans/:planId/tiers              → agregar
 *   PATCH  /api/platform/billing/plans/:planId/tiers/:tierId      → editar descuento
 *   DELETE /api/platform/billing/plans/:planId/tiers/:tierId      → eliminar
 */
router
  .group(() => {
    // ─── Planes ─────────────────────────────────────────────────────────────
    router.get('/plans', '#controllers/billing_plan_controller.index')
    router.post('/plans', '#controllers/billing_plan_controller.store')
    router.get('/plans/:planId', '#controllers/billing_plan_controller.show')
    router.patch('/plans/:planId', '#controllers/billing_plan_controller.update')
    router.delete('/plans/:planId', '#controllers/billing_plan_controller.destroy')
    router.post('/plans/:planId/publish', '#controllers/billing_plan_controller.publish')
    router.post('/plans/:planId/clone', '#controllers/billing_plan_controller.clone')
    router.get('/plans/:planId/resolved-price', '#controllers/billing_plan_controller.resolvedPrice')

    // ─── Precios (append-only) ───────────────────────────────────────────────
    router.get('/plans/:planId/prices', '#controllers/billing_price_controller.index')
    router.post('/plans/:planId/prices', '#controllers/billing_price_controller.store')

    // ─── Tramos ─────────────────────────────────────────────────────────────
    router.get('/plans/:planId/tiers', '#controllers/billing_tier_controller.index')
    router.post('/plans/:planId/tiers', '#controllers/billing_tier_controller.store')
    router.patch('/plans/:planId/tiers/:tierId', '#controllers/billing_tier_controller.update')
    router.delete('/plans/:planId/tiers/:tierId', '#controllers/billing_tier_controller.destroy')
  })
  .prefix('/api/platform/billing')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
