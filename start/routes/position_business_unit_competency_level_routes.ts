import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/position_business_unit_competency_level_controller.store')
    router.put(
      '/:positionBusinessUnitCompetencyLevelId',
      '#controllers/position_business_unit_competency_level_controller.update'
    )
    router.delete(
      '/:positionBusinessUnitCompetencyLevelId',
      '#controllers/position_business_unit_competency_level_controller.delete'
    )
    router.get(
      '/by-position/:positionId',
      '#controllers/position_business_unit_competency_level_controller.getByPosition'
    )
  })
  .prefix('/api/position-business-unit-competency-levels')
  .use(middleware.auth())
