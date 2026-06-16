import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/status', '#controllers/complaint_controller.consultStatus')
    router
      .post('/', '#controllers/complaint_controller.store')
      .use(middleware.auth())
    router
      .get('/', '#controllers/complaint_controller.index')
      .use(middleware.auth())
      .use(middleware.businessScope())
    router
      .put('/:complaintId/status', '#controllers/complaint_controller.updateStatus')
      .use(middleware.auth())
      .use(middleware.businessScope())
  })
  .prefix('/api/v1/complaints')
