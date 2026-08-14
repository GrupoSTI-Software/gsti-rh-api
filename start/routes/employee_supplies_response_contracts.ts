import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/employee-supplies-response-contracts', '#controllers/employee_supplies_response_contracts_controller.store')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeSupplyResponseContract
        )
      )
    router.get('/employee-supplies-response-contracts', '#controllers/employee_supplies_response_contracts_controller.index')
    router.get('/employee-supplies-response-contracts/:id', '#controllers/employee_supplies_response_contracts_controller.show')
    router.get('/employee-supplies-response-contracts/by-uuid/:uuid', '#controllers/employee_supplies_response_contracts_controller.getByUuid')
    router
      .delete('/employee-supplies-response-contracts/:id', '#controllers/employee_supplies_response_contracts_controller.destroy')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeSupplyResponseContract
        )
      )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())

