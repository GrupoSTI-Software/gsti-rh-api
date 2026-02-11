import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/estructure_demo_controller.generateInformationDemo')
  })
  .prefix('/api/generate-info-demo')
.use(middleware.auth())
