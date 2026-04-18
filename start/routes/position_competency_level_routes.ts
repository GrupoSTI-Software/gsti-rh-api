import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/position_competency_level_controller.store')
    router.put(
      '/:positionCompetencyLevelId',
      '#controllers/position_competency_level_controller.update'
    )
    router.delete(
      '/:positionCompetencyLevelId',
      '#controllers/position_competency_level_controller.delete'
    )
    router.get(
      '/by-position/:positionId',
      '#controllers/position_competency_level_controller.getByPosition'
    )
  })
  .prefix('/api/position-competency-levels')
  .use(middleware.auth())
