import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'

router
  .group(() => {
    router.get('/', '#controllers/employee_record_property_controller.index')
    router.get(
      '/get-categories-by-employee',
      '#controllers/employee_record_property_controller.getCategories'
    ).use(
      middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeRecordCategories)
    )
  })
  .prefix('/api/employee-record-properties')
  .use(middleware.auth())
