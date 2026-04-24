import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/position_salary_range_controller.store')
    router.get('/', '#controllers/position_salary_range_controller.index')
    router.get('/current', '#controllers/position_salary_range_controller.current')
    router.delete('/:positionSalaryRangeId', '#controllers/position_salary_range_controller.close')
  })
  .prefix('/api/position-salary-ranges')
  .use(middleware.auth())
