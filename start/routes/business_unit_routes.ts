import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

router
  .group(() => {
    router.get('/', '#controllers/business_unit_controller.index')
  })
  .prefix('/api/business-units')
  .use(middleware.auth())
  .use(middleware.businessScope())
