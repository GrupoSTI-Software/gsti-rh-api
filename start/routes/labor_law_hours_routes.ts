import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/labor_law_hours_controller.index').use(middleware.auth())
    router.get('/active', '#controllers/labor_law_hours_controller.getActive').use(middleware.auth())
    router.post('/', '#controllers/labor_law_hours_controller.store').use(middleware.auth())
    router.put('/:laborLawHoursId', '#controllers/labor_law_hours_controller.update').use(middleware.auth())
    router.delete('/:laborLawHoursId', '#controllers/labor_law_hours_controller.delete').use(middleware.auth())
    router.get('/:laborLawHoursId', '#controllers/labor_law_hours_controller.show').use(middleware.auth())
  })
  .prefix('/api/labor-law-hours')

