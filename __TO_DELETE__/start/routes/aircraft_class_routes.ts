import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/aircraft_classes_controller.index')
    router.post('/', '#controllers/aircraft_classes_controller.store')
    router.put('/:id', '#controllers/aircraft_classes_controller.update')
    router.delete('/:id', '#controllers/aircraft_classes_controller.destroy')
    router.get('/:id', '#controllers/aircraft_classes_controller.show')
  })
  .prefix('/api/aircraft-classes')
  .use(middleware.auth())
