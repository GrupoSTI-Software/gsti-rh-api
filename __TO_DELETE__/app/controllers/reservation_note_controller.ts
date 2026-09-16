import { HttpContext } from '@adonisjs/core/http'
import ReservationNote from '#models/reservation_note'
import ReservationNoteService from '#services/reservation_note_service'
import { createReservationNoteValidator } from '#validators/reservation_note'

export default class ReservationNoteController {
  /**
   * @swagger
   * /api/reservation-notes:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Reservation Notes
   *     summary: Create new reservation note
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               noteContent:
   *                 type: string
   *                 description: Content of the reservation note
   *               reservationId:
   *                 type: number
   *                 description: FK to reservations table
   *     responses:
   *       '201':
   *         description: Reservation note created successfully
   *       '400':
   *         description: Invalid parameters or missing data
   *       '500':
   *         description: Server error
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createReservationNoteValidator)
      const requestData = request.only(['reservationNoteContent', 'reservationId'])
      const reservationNoteData = {
        reservationId: requestData.reservationId,
        reservationNoteContent: requestData.reservationNoteContent,
      } as ReservationNote

      const reservationNoteService = new ReservationNoteService()
      const valid = await reservationNoteService.verifyInfo(reservationNoteData)
      if (valid.status === 400) {
        response.status(400)
        return {
          type: 'error',
          title: 'Reservation Note',
          message: 'Reservation not found',
          data: { ...data },
        }
      }
      const reservationNote = await reservationNoteService.create(reservationNoteData)

      response.status(201)
      return {
        type: 'success',
        title: 'Reservation Note',
        message: 'Reservation note created successfully',
        data: { reservationNote },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/reservation-notes/{reservationNoteId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Reservation Notes
   *     summary: Update reservation note by ID
   *     parameters:
   *       - name: reservationNoteId
   *         in: path
   *         required: true
   *         description: ID of the reservation note to update
   *         schema:
   *           type: integer
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               note:
   *                 type: string
   *                 description: The updated note content
   *     responses:
   *       '200':
   *         description: Reservation note updated successfully
   *       '400':
   *         description: Invalid parameters or missing data
   *       '404':
   *         description: Reservation note not found
   *       '500':
   *         description: Server error
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const reservationNoteId = params.reservationNoteId
      const requestData = request.only(['reservationNoteContent', 'reservationId'])
      const data = request.validateUsing(createReservationNoteValidator)
      const reservationNoteData = {
        reservationId: requestData.reservationId,
        reservationNoteContent: requestData.reservationNoteContent,
      } as ReservationNote
      const reservationNoteService = new ReservationNoteService()
      const valid = await reservationNoteService.verifyInfo(reservationNoteData)
      if (valid.status === 400) {
        response.status(400)
        return {
          type: 'error',
          title: 'Reservation Note',
          message: 'Reservation not found',
          data: { ...data },
        }
      }
      const reservationNote = await reservationNoteService.update(
        reservationNoteId,
        reservationNoteData
      )
      response.status(200)
      return {
        type: 'success',
        title: 'Reservation Note',
        message: 'Reservation note updated successfully',
        data: { reservationNote },
      }
    } catch (error) {
      response.status(error.status || 500)
      return {
        type: 'error',
        title: 'Update Error',
        message: error.message,
        error: error,
      }
    }
  }

  /**
   * @swagger
   * /api/reservation-notes/{reservationNoteId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Reservation Notes
   *     summary: Delete reservation note by ID
   *     parameters:
   *       - name: reservationNoteId
   *         in: path
   *         required: true
   *         description: ID of the reservation note to delete
   *         schema:
   *           type: integer
   *     responses:
   *       '204':
   *         description: Reservation note deleted successfully
   *       '404':
   *         description: Reservation note not found
   *       '500':
   *         description: Server error
   */
  async delete({ params, response }: HttpContext) {
    try {
      const reservationNoteId = params.reservationNoteId
      const reservationNote = await ReservationNote.findOrFail(reservationNoteId)
      await reservationNote.delete()

      response.status(204)
    } catch (error) {
      response.status(error.status || 500).send({
        type: 'error',
        title: 'Delete Error',
        message: error.message,
        error: error,
      })
    }
  }
}
