import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/aircraft_properties_controller.index')
    router.post('/', '#controllers/aircraft_properties_controller.store')
    router.put('/:id', '#controllers/aircraft_properties_controller.update')
    router.delete('/:id', '#controllers/aircraft_properties_controller.destroy')
    router.get('/:id', '#controllers/aircraft_properties_controller.show')
  })
  .prefix('/api/aircraft-properties')
  .use(middleware.auth())
