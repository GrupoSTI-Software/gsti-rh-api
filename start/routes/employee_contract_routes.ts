/* eslint-disable prettier/prettier */
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/employee_contract_controller.store')
    router.put('/:employeeContractId', '#controllers/employee_contract_controller.update')
    router.delete('/:employeeContractId', '#controllers/employee_contract_controller.delete')
    router.get('/:employeeContractId', '#controllers/employee_contract_controller.show')
    router
      .get('/:employeeContractId/download', '#controllers/employee_contract_controller.download')
      .use(middleware.businessScopeOptional())
  })
  .use(middleware.auth())
  .prefix('/api/employee-contracts')
