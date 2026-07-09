import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/employee_bank_controller.store')
    router.put('/:employeeBankId', '#controllers/employee_bank_controller.update')
    router.delete('/:employeeBankId', '#controllers/employee_bank_controller.delete')
    router.get('/:employeeBankId', '#controllers/employee_bank_controller.show')
  })
  .prefix('/api/employee-banks')
  .use(middleware.auth())
  .use(middleware.businessScope())
