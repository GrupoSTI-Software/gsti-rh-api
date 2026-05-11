import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/business_unit_competency_level_controller.index')
    router.post('/', '#controllers/business_unit_competency_level_controller.store')
    router.get('/:businessUnitCompetencyLevelId', '#controllers/business_unit_competency_level_controller.show')
    router.put('/:businessUnitCompetencyLevelId', '#controllers/business_unit_competency_level_controller.update')
    router.delete('/:businessUnitCompetencyLevelId', '#controllers/business_unit_competency_level_controller.delete')
  })
  .prefix('/api/business-unit-competency-levels')
  .use(middleware.auth())
