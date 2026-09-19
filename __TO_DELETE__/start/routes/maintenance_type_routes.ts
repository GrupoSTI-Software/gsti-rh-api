import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/maintenance_type_controller.index')
  })
  .prefix('/api/maintenance-type')
  .use(middleware.auth())
