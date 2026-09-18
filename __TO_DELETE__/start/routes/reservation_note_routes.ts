import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    /**
     * POST /api/reservations
     */
    router.post('/', '#controllers/reservation_note_controller.store')
    /**
     * PUT /api/reservations/:reservationNoteId
     */
    router.put('/:reservationNoteId', '#controllers/reservation_note_controller.update')
    /**
     * DELETE /api/reservations/:reservationNoteId
     */
    router.delete('/:reservationNoteId', '#controllers/reservation_note_controller.delete')
  })
  .prefix('/api/reservation-notes')
  .use(middleware.auth())
