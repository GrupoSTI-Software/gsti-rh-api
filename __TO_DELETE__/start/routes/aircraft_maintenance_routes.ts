import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/aircraft_maintenance_controller.index')
    router.post('/', '#controllers/aircraft_maintenance_controller.store')
    router.put('/:id', '#controllers/aircraft_maintenance_controller.update')
    router.delete('/:id', '#controllers/aircraft_maintenance_controller.destroy')
    router.get('/:id', '#controllers/aircraft_maintenance_controller.show')
  })
  .prefix('/api/aircraft-maintenance')
  .use(middleware.auth())
