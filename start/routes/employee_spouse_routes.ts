import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/employee_spouse_controller.store')
    router.put('/:employeeSpouseId', '#controllers/employee_spouse_controller.update')
    router.delete('/:employeeSpouseId', '#controllers/employee_spouse_controller.delete')
    router.get('/:employeeSpouseId', '#controllers/employee_spouse_controller.show')
  })
  .prefix('/api/employee-spouses')
  .use(middleware.auth())
  .use(middleware.businessScope())
