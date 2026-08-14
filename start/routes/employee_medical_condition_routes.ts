import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import EmployeeMedicalConditionController from '#controllers/employee_medical_condition_controller'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

const employeeMedicalConditionController = new EmployeeMedicalConditionController()

router
  .group(() => {
    router.get('/', employeeMedicalConditionController.index)
    router
      .post('/', employeeMedicalConditionController.store)
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeMedicalCondition)
      )
    router.get('/employee/:employeeId', employeeMedicalConditionController.getByEmployee)
    router.get('/:employeeMedicalConditionId', employeeMedicalConditionController.show)
    router
      .put('/:employeeMedicalConditionId', employeeMedicalConditionController.update)
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeMedicalCondition)
      )
    router
      .delete('/:employeeMedicalConditionId', employeeMedicalConditionController.delete)
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeMedicalCondition)
      )
  })
  .prefix('/api/employee-medical-conditions')
  .use(middleware.auth())
  .use(middleware.businessScope())
