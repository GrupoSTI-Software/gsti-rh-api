import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    /**
     * GET /api/reservations
     */
    router.get('/', '#controllers/reservation_controller.index')
    /**
     * POST /api/reservations
     */
    router.post('/', '#controllers/reservation_controller.store')
    /**
     * PUT /api/reservations/:reservationId
     */
    router.put('/:reservationId', '#controllers/reservation_controller.update')
    /**
     * DELETE /api/reservations/:reservationId
     */
    router.delete('/:reservationId', '#controllers/reservation_controller.delete')
    /**
     * GET /api/reservations/:reservationId
     */
    router.get('/:reservationId', '#controllers/reservation_controller.show')
  })
  .prefix('/api/reservations')
  .use(middleware.auth())
