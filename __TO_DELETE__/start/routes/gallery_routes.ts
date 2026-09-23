import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/galleries_controller.index')
    router.post('/', '#controllers/galleries_controller.store')
    router.put('/:id', '#controllers/galleries_controller.update')
    router.delete('/:id', '#controllers/galleries_controller.destroy')
    router.get('/:id', '#controllers/galleries_controller.show')
  })
  .prefix('/api/galleries')
  .use(middleware.auth())
