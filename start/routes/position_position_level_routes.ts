import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/:positionId/levels', '#controllers/position_position_level_controller.index')
    router.put('/:positionId/levels', '#controllers/position_position_level_controller.replace')
    router.delete(
      '/:positionId/levels/:positionPositionLevelId',
      '#controllers/position_position_level_controller.destroy'
    )
  })
  .prefix('/api/positions')
  .use(middleware.auth())
  .use(middleware.businessScope())
