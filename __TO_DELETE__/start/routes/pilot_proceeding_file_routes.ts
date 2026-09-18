import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/get-expired-and-expiring',
      '#controllers/pilot_proceeding_file_controller.getExpiresAndExpiring'
    )
    router.get('/', '#controllers/pilot_proceeding_file_controller.index')
    router.post('/', '#controllers/pilot_proceeding_file_controller.store')
    router.put('/:pilotProceedingFileId', '#controllers/pilot_proceeding_file_controller.update')
    router.delete('/:pilotProceedingFileId', '#controllers/pilot_proceeding_file_controller.delete')
    router.get('/:pilotProceedingFileId', '#controllers/pilot_proceeding_file_controller.show')
  })
  .prefix('/api/pilots-proceeding-files')
  .use(middleware.auth())
