import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/position_work_tool_controller.store')
    router.put('/:positionWorkToolId', '#controllers/position_work_tool_controller.update')
    router.delete('/:positionWorkToolId', '#controllers/position_work_tool_controller.delete')
    router.get('/distinct-names', '#controllers/position_work_tool_controller.getDistinctNames')
    router.get('/by-position/:positionId', '#controllers/position_work_tool_controller.getByPosition')
  })
  .prefix('/api/position-work-tools')
  .use(middleware.auth())
