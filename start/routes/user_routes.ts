import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { USERS_PERMISSION_DECLARATIONS } from '#constants/users_permission_declarations'

router
  .group(() => { 
    router.get(
      '/has-access-department/:userId/:departmentId',
      '#controllers/user_controller.hasAccessDepartment'
    )
    router
      .get(
        '/:userId/employees-assigned/:employeeId?',
        '#controllers/user_controller.getEmployeesAssigned'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeesAssigned)
      )
    router.get('/', '#controllers/user_controller.index')
    router.post('/', '#controllers/user_controller.store').use(middleware.permissionGate(USERS_PERMISSION_DECLARATIONS.store))
    router.put('/:userId', '#controllers/user_controller.update').use(middleware.permissionGate(USERS_PERMISSION_DECLARATIONS.update))
    router.delete('/:userId', '#controllers/user_controller.delete').use(middleware.permissionGate(USERS_PERMISSION_DECLARATIONS.delete))
    router.get('/:userId', '#controllers/user_controller.show').use(middleware.permissionGate(USERS_PERMISSION_DECLARATIONS.show))
  })
  .prefix('/api/users')
  .use(middleware.auth())
  .use(middleware.businessScope())
