import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/get-expired-and-expiring',
      '#controllers/employee_certification_expiration_controller.getExpiresAndExpiring'
    )
    router.get(
      '/',
      '#controllers/employee_certification_expiration_controller.index'
    )
  })
  .prefix('/api/employee-certifications')
  .use(middleware.auth())
  .use(middleware.businessScope())
