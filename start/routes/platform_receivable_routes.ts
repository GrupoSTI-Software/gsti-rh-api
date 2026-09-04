import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * ─── Métricas de plataforma · cartera vencida ────────────────────────────────
 *   GET  /api/platform/metrics/receivables  → total vencido, antigüedad y detalle
 *
 *   Tras guard platformAdmin (auth + is_platform_admin), aplicado a nivel de
 *   grupo. Ref: USRH1788052455651.
 */
router
  .group(() => {
    router.get('/', '#controllers/platform_receivable_controller.index')
  })
  .prefix('/api/platform/metrics/receivables')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
