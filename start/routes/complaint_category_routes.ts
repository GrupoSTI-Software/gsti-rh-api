import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/complaint_category_controller.index')
  })
  .prefix('/api/v1/complaint-categories')
  .use(middleware.auth())
