import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/work_disability_controller.index')
    router.post('/', '#controllers/work_disability_controller.store')
    router.delete('/:workDisabilityId', '#controllers/work_disability_controller.delete')
    router.put('/:workDisabilityId', '#controllers/work_disability_controller.update')
    router.get('/:workDisabilityId', '#controllers/work_disability_controller.show')
    router.get('/employee/:employeeId', '#controllers/work_disability_controller.getByEmployee')
  })
  .prefix('/api/work-disabilities')
  .use(middleware.auth())
  .use(middleware.businessScope())
