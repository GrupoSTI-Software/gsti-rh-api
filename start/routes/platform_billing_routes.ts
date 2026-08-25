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
 *   POST   /api/platform/billing/plans/:planId/publish    → publicar (irreversible; descarta hermanas del linaje)
 *   POST   /api/platform/billing/plans/:planId/deactivate    → retirar del catálogo (irreversible, no toca suscripciones)
 *   POST   /api/platform/billing/plans/:planId/clone         → clonar como borrador
 *   GET    /api/platform/billing/plans/:planId/resolved-price → precio determinista
 *   POST   /api/platform/billing/plans/:planId/mark-public   → señalar como el plan público de la landing
 *   POST   /api/platform/billing/plans/:planId/unmark-public → quitar la señal de plan público
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
 *
 * ─── Suscripciones (alta manual) ──────────────────────────────────────────
 *   GET    /api/platform/billing/subscriptions                     → listar
 *   GET    /api/platform/billing/subscriptions/:id                 → detalle
 *   POST   /api/platform/billing/subscriptions                     → alta manual (congela el trato)
 *   POST   /api/platform/billing/subscriptions/:id/change-plan     → cambio de plan (recongela el snapshot)
 *   POST   /api/platform/billing/subscriptions/:id/cancel          → cancelar suscripción
 *
 * ─── Empresas (picker mínimo para el alta) ────────────────────────────────
 *   GET    /api/platform/billing/business-units         → listar empresas activas
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
    router.post('/plans/:planId/deactivate', '#controllers/billing_plan_controller.deactivate')
    router.post('/plans/:planId/clone', '#controllers/billing_plan_controller.clone')
    router.get('/plans/:planId/resolved-price', '#controllers/billing_plan_controller.resolvedPrice')
    router.post('/plans/:planId/mark-public', '#controllers/billing_plan_controller.markPublic')
    router.post('/plans/:planId/unmark-public', '#controllers/billing_plan_controller.unmarkPublic')

    // ─── Precios (append-only) ───────────────────────────────────────────────
    router.get('/plans/:planId/prices', '#controllers/billing_price_controller.index')
    router.post('/plans/:planId/prices', '#controllers/billing_price_controller.store')

    // ─── Tramos ─────────────────────────────────────────────────────────────
    router.get('/plans/:planId/tiers', '#controllers/billing_tier_controller.index')
    router.post('/plans/:planId/tiers', '#controllers/billing_tier_controller.store')
    router.patch('/plans/:planId/tiers/:tierId', '#controllers/billing_tier_controller.update')
    router.delete('/plans/:planId/tiers/:tierId', '#controllers/billing_tier_controller.destroy')

    // ─── Suscripciones ──────────────────────────────────────────────────────
    router.get('/subscriptions', '#controllers/billing_subscription_controller.index')
    router.post('/subscriptions', '#controllers/billing_subscription_controller.store')
    router.get('/subscriptions/:subscriptionId', '#controllers/billing_subscription_controller.show')
    router.post('/subscriptions/:id/change-plan', '#controllers/billing_subscription_controller.changePlan')
    router.post('/subscriptions/:id/cancel', '#controllers/billing_subscription_controller.cancel')

    // ─── Empresas (picker del alta) ─────────────────────────────────────────
    router.get('/business-units', '#controllers/billing_subscription_controller.businessUnits')
  })
  .prefix('/api/platform/billing')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
