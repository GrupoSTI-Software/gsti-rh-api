import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/aircraft_operators_controller.index')
    router.post('/', '#controllers/aircraft_operators_controller.store')
    router.put('/:aircraftOperatorId', '#controllers/aircraft_operators_controller.update')
    router.delete('/:aircraftOperatorId', '#controllers/aircraft_operators_controller.delete')
    router.get('/:aircraftOperatorId', '#controllers/aircraft_operators_controller.show')
  })
  .prefix('/api/aircraft-operators')
  .use(middleware.auth())

export default router
