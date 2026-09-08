import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * ─── Métricas de plataforma · ingreso recurrente ──────────────────────────────
 *   GET  /api/platform/metrics/mrr  → actual neto y proyectado de pruebas
 *
 *   Tras guard platformAdmin (auth + is_platform_admin), aplicado a nivel de
 *   grupo y en ese orden. Ref: USRH1788052455653.
 *
 *   El prefijo llega hasta `/metrics` a propósito: la serie mensual de MRR
 *   (USRH1788052455654) agrega su ruta a este mismo grupo.
 */
router
  .group(() => {
    router.get('/mrr', '#controllers/platform_mrr_controller.index')
  })
  .prefix('/api/platform/metrics')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
