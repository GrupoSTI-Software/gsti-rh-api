import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/position_salary_range_controller.store')
    router.get('/', '#controllers/position_salary_range_controller.index')
    router.get('/current', '#controllers/position_salary_range_controller.current')
    router.get('/history', '#controllers/position_salary_range_controller.history')
    router.patch('/:positionSalaryRangeId', '#controllers/position_salary_range_controller.update')
    router.get('/:positionSalaryRangeId/audit', '#controllers/position_salary_range_controller.audit')
    router.delete('/:positionSalaryRangeId', '#controllers/position_salary_range_controller.close')
  })
  .prefix('/api/position-salary-ranges')
  .use(middleware.auth())
