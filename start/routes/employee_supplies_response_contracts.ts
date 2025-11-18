import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/employee-supplies-response-contracts', '#controllers/employee_supplies_response_contracts_controller.store')
    router.get('/employee-supplies-response-contracts', '#controllers/employee_supplies_response_contracts_controller.index')
    router.get('/employee-supplies-response-contracts/:id', '#controllers/employee_supplies_response_contracts_controller.show')
    router.get('/employee-supplies-response-contracts/by-uuid/:uuid', '#controllers/employee_supplies_response_contracts_controller.getByUuid')
    router.delete('/employee-supplies-response-contracts/:id', '#controllers/employee_supplies_response_contracts_controller.destroy')
  })
  .prefix('/api')
  .use(middleware.auth())

