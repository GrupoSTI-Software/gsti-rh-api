import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/get-expired-and-expiring',
      '#controllers/flight_attendant_proceeding_file_controller.getExpiresAndExpiring'
    )
    router.get('/', '#controllers/flight_attendant_proceeding_file_controller.index')
    router.post('/', '#controllers/flight_attendant_proceeding_file_controller.store')
    router.put(
      '/:flightAttendantProceedingFileId',
      '#controllers/flight_attendant_proceeding_file_controller.update'
    )
    router.delete(
      '/:flightAttendantProceedingFileId',
      '#controllers/flight_attendant_proceeding_file_controller.delete'
    )
    router.get(
      '/:flightAttendantProceedingFileId',
      '#controllers/flight_attendant_proceeding_file_controller.show'
    )
  })
  .prefix('/api/flight-attendant-proceeding-files')
  .use(middleware.auth())
