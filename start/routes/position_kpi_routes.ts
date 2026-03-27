import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/position_kpi_controller.store')
    router.put('/:positionKpiId', '#controllers/position_kpi_controller.update')
    router.delete('/:positionKpiId', '#controllers/position_kpi_controller.delete')
    router.get('/distinct-names', '#controllers/position_kpi_controller.getDistinctNames')
    router.get('/by-position/:positionId', '#controllers/position_kpi_controller.getByPosition')
  })
  .prefix('/api/position-kpis')
  .use(middleware.auth())
