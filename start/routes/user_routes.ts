import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => { 
    router.get(
      '/has-access-department/:userId/:departmentId',
      '#controllers/user_controller.hasAccessDepartment'
    )
    router.get('/:userId/employees-assigned/:employeeId?', '#controllers/user_controller.getEmployeesAssigned')
    router.get('/', '#controllers/user_controller.index')
    router.post('/', '#controllers/user_controller.store')
    router.put('/:userId', '#controllers/user_controller.update')
    router.delete('/:userId', '#controllers/user_controller.delete')
    router.get('/:userId', '#controllers/user_controller.show')
  })
  .prefix('/api/users')
  .use(middleware.auth())
  .use(middleware.businessScope())
