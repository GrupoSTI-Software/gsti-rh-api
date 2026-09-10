import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * ─── Métricas de plataforma · ingreso recurrente ──────────────────────────────
 *   GET  /api/platform/metrics/mrr         → actual neto y proyectado de pruebas
 *   GET  /api/platform/metrics/mrr-series  → serie mensual de MRR cobrado
 *
 *   Tras guard platformAdmin (auth + is_platform_admin), aplicado a nivel de
 *   grupo y en ese orden. Refs: USRH1788052455653, USRH1788052455654.
 *
 *   Las dos rutas miden cosas distintas: `/mrr` es ingreso CONTRATADO vigente
 *   hoy y `/mrr-series` es ingreso COBRADO por periodo. Comparten prefijo, no
 *   métrica, y sus números no tienen por qué coincidir.
 */
router
  .group(() => {
    router.get('/mrr', '#controllers/platform_mrr_controller.index')
    router.get('/mrr-series', '#controllers/platform_mrr_controller.series')
  })
  .prefix('/api/platform/metrics')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
