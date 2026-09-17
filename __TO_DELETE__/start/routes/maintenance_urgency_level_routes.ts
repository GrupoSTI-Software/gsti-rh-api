import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/maintenance_urgency_level_controller.index')
  })
  .prefix('/api/maintenance-urgency-level')
  .use(middleware.auth())
