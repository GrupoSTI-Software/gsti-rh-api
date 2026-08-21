import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/pilot_controller.index')
    router.post('/', '#controllers/pilot_controller.store')
    router.put('/:pilotId', '#controllers/pilot_controller.update')
    router.delete('/:pilotId', '#controllers/pilot_controller.delete')
    router.get('/:pilotId', '#controllers/pilot_controller.show')
    router.get('/:pilotId/proceeding-files', '#controllers/pilot_controller.getProceedingFiles')
  })
  .prefix('/api/pilots')
  .use(middleware.auth())
  .use(middleware.sensitiveAccess())
