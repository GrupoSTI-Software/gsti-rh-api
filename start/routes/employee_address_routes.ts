import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/employee_address_controller.index')
    router.post('/', '#controllers/employee_address_controller.store')
    router.put('/:employeeAddressId', '#controllers/employee_address_controller.update')
    router.delete('/:employeeAddressId', '#controllers/employee_address_controller.delete')
    router.get('/:employeeAddressId', '#controllers/employee_address_controller.show')
  })
  .prefix('/api/employee-address')
  .use(middleware.auth())
  .use(middleware.businessScope())
