import router from '@adonisjs/core/services/router'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/employee_type_controller.index')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexEmployeeTypes))
  })
  .prefix('/api/employee-types')
  .use(middleware.auth())
  .use(middleware.businessScope())
