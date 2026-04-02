import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/employee_evaluation_controller.index')
    router.post('/', '#controllers/employee_evaluation_controller.store')
    router.put('/:employeeEvaluationId', '#controllers/employee_evaluation_controller.update')
    router.delete('/:employeeEvaluationId', '#controllers/employee_evaluation_controller.destroy')
    router.get('/:employeeEvaluationId', '#controllers/employee_evaluation_controller.show')
    router.get('/by-employee/:employeeId', '#controllers/employee_evaluation_controller.getByEmployee')
    router.put('/update-potential/:employeeEvaluationId', '#controllers/employee_evaluation_controller.updatePotential')
  })
  .prefix('/api/employee-evaluations')
  .use(middleware.auth())
