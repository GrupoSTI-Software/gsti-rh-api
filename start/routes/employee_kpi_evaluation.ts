import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/employee_kpi_evaluation_controller.index')
    router.post('/', '#controllers/employee_kpi_evaluation_controller.store')
    router.put('/:employeeKpiEvaluationId', '#controllers/employee_kpi_evaluation_controller.update')
    router.delete('/:employeeKpiEvaluationId', '#controllers/employee_kpi_evaluation_controller.destroy')
    router.get('/:employeeKpiEvaluationId', '#controllers/employee_kpi_evaluation_controller.show')
  })
  .prefix('/api/employee-kpi-evaluations')
  .use(middleware.auth())
