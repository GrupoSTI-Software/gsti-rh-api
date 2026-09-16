import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/get-expired-and-expiring',
      '#controllers/customer_proceeding_file_controller.getExpiresAndExpiring'
    )
    router.get('/', '#controllers/customer_proceeding_file_controller.index')
    router.post('/', '#controllers/customer_proceeding_file_controller.store')
    router.put(
      '/:customerProceedingFileId',
      '#controllers/customer_proceeding_file_controller.update'
    )
    router.delete(
      '/:customerProceedingFileId',
      '#controllers/customer_proceeding_file_controller.delete'
    )
    router.get(
      '/:customerProceedingFileId',
      '#controllers/customer_proceeding_file_controller.show'
    )
  })
  .prefix('/api/customers-proceeding-files')
  .use(middleware.auth())
