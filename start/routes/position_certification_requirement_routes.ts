import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/:positionId/certification-requirements',
      '#controllers/position_certification_requirement_controller.index'
    )
    router.post(
      '/:positionId/certification-requirements',
      '#controllers/position_certification_requirement_controller.store'
    )
    router.delete(
      '/:positionId/certification-requirements/:certificationId',
      '#controllers/position_certification_requirement_controller.destroy'
    )
  })
  .prefix('/api/positions')
  .use(middleware.auth())
  .use(middleware.businessScope())
