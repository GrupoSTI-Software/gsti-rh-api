import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get('/', '#controllers/employee_bonus_controller.index')
    router
      .post('/', '#controllers/employee_bonus_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeBonus))
    router.get('/concepts/:employeeId', '#controllers/employee_bonus_controller.concepts')
    router.get('/:employeeBonusId', '#controllers/employee_bonus_controller.show')
    router
      .put('/:employeeBonusId', '#controllers/employee_bonus_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeBonus))
    router
      .delete('/:employeeBonusId', '#controllers/employee_bonus_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeBonus))
  })
  .prefix('/api/employee-bonuses')
  .use(middleware.auth())
  .use(middleware.businessScope())
