import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/exception_requests_controller.index')
    router.get('/all', '#controllers/exception_requests_controller.indexAllExceptionRequests')
    router.get('/my-requests', '#controllers/exception_requests_controller.getMyExceptionRequests')
    router.get('/unread', '#controllers/exception_requests_controller.getUnreadExceptionRequests')
    router.post('/', '#controllers/exception_requests_controller.store')
    router.put('/:id', '#controllers/exception_requests_controller.update')
    router.delete('/:id', '#controllers/exception_requests_controller.destroy')
    router.get('/:id', '#controllers/exception_requests_controller.show')
    router.post('/:id/status', '#controllers/exception_requests_controller.updateStatus')
  })
  .prefix('/api/exception-requests')
  .use(middleware.auth())
