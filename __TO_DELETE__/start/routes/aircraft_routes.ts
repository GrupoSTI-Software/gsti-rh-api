import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/aircrafts_controller.index')
    router.post('/', '#controllers/aircrafts_controller.store')
    router.put('/:id', '#controllers/aircrafts_controller.update')
    router.delete('/:id', '#controllers/aircrafts_controller.destroy')
    router.get('/:id', '#controllers/aircrafts_controller.show')
  })
  .prefix('/api/aircraft')
  .use(middleware.auth())
