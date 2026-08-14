import router from '@adonisjs/core/services/router'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router
      .post('/departments', '#controllers/department_controller.synchronization')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.syncDepartments))
    router
      .post('/positions', '#controllers/position_controller.synchronization')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.syncPositions))
    router
      .post('/employees', '#controllers/employee_controller.synchronization')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.syncEmployees))
    // Deuda ajena a permisos: ShiftsController no implementa synchronization.
    // Se declara el permiso para no dejar la superficie incompleta si se repara.
    router
      .post('/shift', '#controllers/shifts_controller.synchronization')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.syncShift))
    router
      .post('/by-selection/employees', '#controllers/employee_controller.synchronizationBySelection')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.syncEmployeesBySelection))
  })
  .prefix('/api/synchronization')
  .use(middleware.auth())
