import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/flight_attendant_controller.index')
    router.post('/', '#controllers/flight_attendant_controller.store')
    router.put('/:flightAttendantId', '#controllers/flight_attendant_controller.update')
    router.delete('/:flightAttendantId', '#controllers/flight_attendant_controller.delete')
    router.get('/:flightAttendantId', '#controllers/flight_attendant_controller.show')
    router.get(
      '/:flightAttendantId/proceeding-files',
      '#controllers/flight_attendant_controller.getProceedingFiles'
    )
  })
  .prefix('/api/flight-attendants')
  .use(middleware.auth())
  .use(middleware.sensitiveAccess())
  .use(middleware.sensitiveMaskEcho())
