import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/get-expired-and-expiring',
      '#controllers/aircraft_proceeding_files_controller.getExpiresAndExpiring'
    )
    router.get('/', '#controllers/aircraft_proceeding_files_controller.index')
    router.post('/', '#controllers/aircraft_proceeding_files_controller.store')
    router.get('/:id', '#controllers/aircraft_proceeding_files_controller.show')
    router.put('/:id', '#controllers/aircraft_proceeding_files_controller.update')
    router.delete('/:id', '#controllers/aircraft_proceeding_files_controller.destroy')
    router.get(
      '/:aircraftId/proceeding-files',
      '#controllers/aircraft_proceeding_files_controller.getAircraftProceedingFiles'
    )
  })
  .prefix('/api/aircraft-proceeding-files')
  .use(middleware.auth())
