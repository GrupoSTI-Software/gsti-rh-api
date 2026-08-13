import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'

router
  .group(() => {
    router
      .get('/:employeeId/biometrics', '#controllers/employee_biometric_controller.show')
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeBiometrics)
      )
    router
      .get(
        '/:employeeId/biometrics/fingers',
        '#controllers/employee_biometric_controller.getFingers'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeFingers)
      )
    router
      .get(
        '/:employeeId/biometrics/face',
        '#controllers/employee_biometric_controller.getFaceStatus'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeFaceStatus)
      )
    router
      .post('/:employeeId/biometrics', '#controllers/employee_biometric_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeBiometric))
    router
      .put('/:employeeId/biometrics', '#controllers/employee_biometric_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeBiometric))
    router
      .put(
        '/:employeeId/biometrics/fingers',
        '#controllers/employee_biometric_controller.updateFingers'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeFingers))
    router
      .put(
        '/:employeeId/biometrics/face',
        '#controllers/employee_biometric_controller.updateFaceStatus'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeFaceStatus))
  })
  .prefix('/api/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
