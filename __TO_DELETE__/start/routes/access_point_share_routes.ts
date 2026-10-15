import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Invitaciones de empresas del grupo a un checador (VLRH-P0065, 5).
 *
 *   GET    /api/platform/device-assignments/:assignmentId/shares          → historial + candidatas
 *   POST   /api/platform/device-assignments/:assignmentId/shares          → otorgar
 *   DELETE /api/platform/device-assignments/:assignmentId/shares/:shareId → revocar
 *
 * Solo el landlord otorga y revoca (D3): auth + platformAdmin, sin businessScope.
 * Ref: VLRH-H1792078645307.
 */
router
  .group(() => {
    router.get('/', '#modules/access-point/sharing/access_point_share.controller.index')
    router.post('/', '#modules/access-point/sharing/access_point_share.controller.store')
    router
      .delete('/:shareId', '#modules/access-point/sharing/access_point_share.controller.destroy')
      .where('shareId', router.matchers.number())
  })
  .prefix('/api/platform/device-assignments/:assignmentId/shares')
  .where('assignmentId', router.matchers.number())
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
