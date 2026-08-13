/* eslint-disable prettier/prettier */
import router from '@adonisjs/core/services/router'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router
      .post('/', '#controllers/employee_contract_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeContract))
    router
      .put('/:employeeContractId', '#controllers/employee_contract_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeContract))
    router
      .delete('/:employeeContractId', '#controllers/employee_contract_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeContract))
    router
      .get('/:employeeContractId', '#controllers/employee_contract_controller.show')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeContract))
    router
      .get('/:employeeContractId/download', '#controllers/employee_contract_controller.download')
      .use(middleware.businessScopeOptional())
  })
  .use(middleware.auth())
  .use(middleware.businessScope())
  .prefix('/api/employee-contracts')
