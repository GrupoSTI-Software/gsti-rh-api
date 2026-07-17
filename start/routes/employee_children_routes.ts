import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/employee_children_controller.store')
    router.put('/:employeeChildrenId', '#controllers/employee_children_controller.update')
    router.delete('/:employeeChildrenId', '#controllers/employee_children_controller.delete')
    router.get('/:employeeChildrenId', '#controllers/employee_children_controller.show')
  })
  .prefix('/api/employee-children')
  .use(middleware.auth())
  .use(middleware.businessScope())
