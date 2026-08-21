import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/customer_controller.index')
    router.post('/', '#controllers/customer_controller.store')
    router.put('/:customerId', '#controllers/customer_controller.update')
    router.delete('/:customerId', '#controllers/customer_controller.delete')
    router.get('/:customerId', '#controllers/customer_controller.show')
    router.get(
      '/:customerId/proceeding-files',
      '#controllers/customer_controller.getProceedingFiles'
    )
  })
  .prefix('/api/customers')
  .use(middleware.auth())
  .use(middleware.sensitiveAccess())
