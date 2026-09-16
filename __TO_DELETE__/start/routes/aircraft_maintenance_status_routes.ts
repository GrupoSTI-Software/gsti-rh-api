import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/aircraft_maintenance_status_controller.index')
  })
  .prefix('/api/aircraft-maintenance-status')
  .use(middleware.auth())
