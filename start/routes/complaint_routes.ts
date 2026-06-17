import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/status', '#controllers/complaint_controller.consultStatus')

    router
      .get('/attachments/:id/download-url', '#controllers/complaint_attachment_controller.downloadUrl')
      .use(middleware.auth())
      .use(middleware.businessScopeOptional())

    router
      .delete('/attachments/:id', '#controllers/complaint_attachment_controller.destroy')
      .use(middleware.auth())
      .use(middleware.businessScopeOptional())

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

    router
      .post('/:folio/attachments', '#controllers/complaint_attachment_controller.store')
      .use(middleware.auth())

    router
      .get('/:complaintId/attachments', '#controllers/complaint_attachment_controller.index')
      .use(middleware.auth())
      .use(middleware.businessScopeOptional())
  })
  .prefix('/api/v1/complaints')
