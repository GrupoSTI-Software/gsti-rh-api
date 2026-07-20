import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/work_disability_period_controller.store')
    router.get('/:workDisabilityPeriodId', '#controllers/work_disability_period_controller.show')
    router.put('/:workDisabilityPeriodId', '#controllers/work_disability_period_controller.update')
    router.delete(
      '/:workDisabilityPeriodId',
      '#controllers/work_disability_period_controller.delete'
    )
  })
  .prefix('/api/work-disability-periods')
  .use(middleware.auth())
  .use(middleware.businessScope())
