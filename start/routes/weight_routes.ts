import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/weight_controller.index')
  })
  .prefix('/api/weights')
  .use(middleware.auth())


