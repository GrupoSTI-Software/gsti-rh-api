import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/employee_zone_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeZone))
    router
      .put('/:employeeZoneId', '#controllers/employee_zone_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeZone))
    router
      .delete('/:employeeZoneId', '#controllers/employee_zone_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeZone))
    router.get('/:employeeZoneId', '#controllers/employee_zone_controller.show')
  })
  .prefix('/api/employee-zones')
  .use(middleware.auth())
  .use(middleware.businessScope())
