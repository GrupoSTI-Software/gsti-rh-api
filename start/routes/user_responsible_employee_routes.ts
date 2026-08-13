import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/user_responsible_employee_controller.store')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createUserResponsibleEmployee
        )
      )
    router
      .put('/:userResponsibleEmployeeId', '#controllers/user_responsible_employee_controller.update')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateUserResponsibleEmployee
        )
      )
    router.get(
      '/:userResponsibleEmployeeId',
      '#controllers/user_responsible_employee_controller.show'
    )
    router
      .delete(
        '/:userResponsibleEmployeeId',
        '#controllers/user_responsible_employee_controller.delete'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteUserResponsibleEmployee
        )
      )
  })
  .prefix('/api/user-responsible-employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
