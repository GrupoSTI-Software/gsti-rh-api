import router from '@adonisjs/core/services/router'
import EmployeeMedicalConditionController from '#controllers/employee_medical_condition_controller'

const employeeMedicalConditionController = new EmployeeMedicalConditionController()

router.group(() => {
  router.get('/', employeeMedicalConditionController.index)
  router.post('/', employeeMedicalConditionController.store)
  router.get('/employee/:employeeId', employeeMedicalConditionController.getByEmployee)
  router.get('/:employeeMedicalConditionId', employeeMedicalConditionController.show)
  router.put('/:employeeMedicalConditionId', employeeMedicalConditionController.update)
  router.delete('/:employeeMedicalConditionId', employeeMedicalConditionController.delete)
}).prefix('/api/employee-medical-conditions')
