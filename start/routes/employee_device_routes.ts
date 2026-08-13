import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'

router
  .group(() => {
    router
      .get('/', '#controllers/employee_device_controller.index')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexEmployeeDevices))
    router
      .get(
        '/employee/:employeeId',
        '#controllers/employee_device_controller.getByEmployee'
      )
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getDevicesByEmployee))
    router
      .put(
        '/:employeeDeviceId/status',
        '#controllers/employee_device_controller.updateStatus'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeDeviceStatus)
      )
    router
      .delete('/:employeeDeviceId', '#controllers/employee_device_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeDevice))
  })
  .prefix('/api/employee-devices')
  .use(middleware.auth())
  .use(middleware.businessScope())
