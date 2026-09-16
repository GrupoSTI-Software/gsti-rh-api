import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    /**
     * POST /api/reservations
     */
    router.post('/', '#controllers/reservation_leg_controller.store')
    /**
     * PUT /api/reservations/:reservationId
     */
    router.put('/:reservationLegId', '#controllers/reservation_leg_controller.update')
    /**
     * DELETE /api/reservations/:reservationId
     */
    router.delete('/:reservationLegId', '#controllers/reservation_leg_controller.delete')
    router.post('/validate', '#controllers/reservation_leg_controller.validateLegDates')
  })
  .prefix('/api/reservation-legs')
  .use(middleware.auth())
