import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/departments', '#controllers/estructure_demo_controller.generateDepartmentDemo')
  })
  .prefix('/api/generate-info-demo')
  .use(middleware.auth())
