import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/access_point_controller.index')
    router.post('/', '#controllers/access_point_controller.store')
    router.get('/employee/:employeeId', '#controllers/access_point_controller.getAccessPointsByEmployee')
    router.get('/:accessPointId', '#controllers/access_point_controller.show')
    router.put('/:accessPointId', '#controllers/access_point_controller.update')
    router.delete('/:accessPointId', '#controllers/access_point_controller.delete')
    router.put('/:accessPointId/connection-status', '#controllers/access_point_controller.updateConnectionStatus')
  })
  .prefix('/api/access-points')
  .use(middleware.auth())
