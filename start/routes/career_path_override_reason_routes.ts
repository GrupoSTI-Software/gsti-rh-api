import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/career_path_override_reason_controller.index')
  })
  .prefix('/api/career-path-override-reasons')
  .use(middleware.auth())


