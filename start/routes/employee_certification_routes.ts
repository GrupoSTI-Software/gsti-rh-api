import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/:employeeId/certifications',
      '#controllers/employee_certification_controller.index'
    )
  })
  .prefix('/api/employees')
  .use(middleware.auth())
