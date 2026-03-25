import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/position_competency_controller.store')
    router.put('/:positionCompetencyId', '#controllers/position_competency_controller.update')
    router.delete('/:positionCompetencyId', '#controllers/position_competency_controller.delete')
    router.get('/distinct-names', '#controllers/position_competency_controller.getDistinctNames')
    router.get('/by-position/:positionId', '#controllers/position_competency_controller.getByPosition')
  })
  .prefix('/api/position-competencies')
  .use(middleware.auth())
