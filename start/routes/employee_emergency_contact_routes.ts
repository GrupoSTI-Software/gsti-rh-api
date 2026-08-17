import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/employee_emergency_contact_controller.store')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeEmergencyContact)
      )
    router
      .put(
        '/:employeeEmergencyContactId',
        '#controllers/employee_emergency_contact_controller.update'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeEmergencyContact)
      )
    router
      .delete(
        '/:employeeEmergencyContactId',
        '#controllers/employee_emergency_contact_controller.delete'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeEmergencyContact)
      )
    router.get(
      '/:employeeEmergencyContactId',
      '#controllers/employee_emergency_contact_controller.show'
    )
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeEmergencyContact)
      )
    router.get(
      '/employee/:employeeId',
      '#controllers/employee_emergency_contact_controller.getByEmployeeId'
    )
  })
  .prefix('/api/employee-emergency-contacts')
  .use(middleware.auth())
  .use(middleware.businessScope())
