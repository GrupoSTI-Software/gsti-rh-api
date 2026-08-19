import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'

router
  .group(() => {
    router
      .get(
        '/get-expired-and-expiring',
        '#controllers/employee_certification_expiration_controller.getExpiresAndExpiring'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_READ_PERMISSION_DECLARATIONS.getExpiredExpiringCertifications
        )
      )
    router
      .get('/', '#controllers/employee_certification_expiration_controller.index')
      .use(
        middleware.permissionGate(
          EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexEmployeeCertificationsExpiration
        )
      )
  })
  .prefix('/api/employee-certifications')
  .use(middleware.auth())
  .use(middleware.businessScope())
