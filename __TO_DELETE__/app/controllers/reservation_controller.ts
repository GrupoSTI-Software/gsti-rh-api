import { HttpContext } from '@adonisjs/core/http'
import Reservation from '#models/reservation'
import ReservationService from '#services/reservation_service'
import { createReservationValidator } from '#validators/reservation'
import { ReservationFilterSearchInterface } from '../interfaces/reservation_filter_search_interface.js'

export default class ReservationController {
  /**
   * @swagger
   * /api/reservations:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Reservations
   *     summary: Get all reservations
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: page
   *         in: query
   *         required: true
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         default: 100
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: List of reservations fetched successfully
   *       '400':
   *         description: Invalid parameters
   *       '404':
   *         description: Not found
   *       '500':
   *         description: Server error
   */
  async index({ request, response }: HttpContext) {
    try {
      const search = request.input('search')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)

      const filters = {
        search,
        page,
        limit,
      } as ReservationFilterSearchInterface

      const reservationService = new ReservationService()
      const reservations = await reservationService.index(filters)

      response.status(200)
      return {
        type: 'success',
        title: 'Reservations',
        message: 'The reservations were found successfully',
        data: { reservations },
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
   * /api/reservations:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Reservations
   *     summary: Create new reservation
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               reservationUuid:
   *                 type: string
   *                 description: Reservation UUID
   *               customerId:
   *                 type: number
   *                 description: FK to customers table
   *               pilotPicId:
   *                 type: number
   *               pilotSicId:
   *                 type: number
   *     responses:
   *       '201':
   *         description: Reservation created
   *       '400':
   *         description: Missing parameters or validation error
   *       '500':
   *         description: Server error
   */
  async store({ request, response }: HttpContext) {
    try {
      // Creamos el objeto parcial para la nueva reservación
      const reservationData = {
        customerId: request.input('customerId'),
        pilotPicId: request.input('pilotPicId'),
        pilotSicId: request.input('pilotSicId'),
        aircraftId: request.input('aircraftId'),
        flightAttendantId: request.input('flightAttendantId'),
        reservationSubtotal: request.input('reservationSubtotal'),
        reservationTaxFactor: request.input('reservationTaxFactor', null),
        reservationTax: request.input('reservationTax', 0),
        reservationTotal: request.input('reservationTotal', 0),
      } as Reservation

      // Validación con Vine (opcional, si tienes un validator):
      const data = await request.validateUsing(createReservationValidator)

      // Lógica de verificación adicional en el service (si aplica)
      const reservationService = new ReservationService()
      const valid = await reservationService.verifyInfo(reservationData)
      if (valid.status !== 200) {
        response.status(valid.status)
        return {
          type: valid.type,
          title: valid.title,
          message: valid.message,
          data: { ...data },
        }
      }

      // Creamos la nueva reservación
      const newReservation = await reservationService.create(reservationData)

      response.status(201)
      return {
        type: 'success',
        title: 'Reservations',
        message: 'The reservation was created successfully',
        data: { reservation: newReservation },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/reservations/{reservationId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Reservations
   *     summary: Update reservation
   *     parameters:
   *       - in: path
   *         name: reservationId
   *         schema:
   *           type: number
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               reservationUuid:
   *                 type: string
   *     responses:
   *       '200':
   *         description: Reservation updated
   *       '400':
   *         description: Missing parameters or validation error
   *       '404':
   *         description: The reservation was not found
   *       '500':
   *         description: Server error
   */
  async update({ request, response }: HttpContext) {
    try {
      const reservationId = request.param('reservationId')
      if (!reservationId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Reservation ID not found',
          message: 'Missing data to process',
          data: { reservationId },
        }
      }
      await request.validateUsing(createReservationValidator)
      const reservationData = {
        reservationId,
        customerId: request.input('customerId'),
        pilotPicId: request.input('pilotPicId'),
        pilotSicId: request.input('pilotSicId'),
        aircraftId: request.input('aircraftId'),
        flightAttendantId: request.input('flightAttendantId'),
        reservationSubtotal: request.input('reservationSubtotal'),
        reservationTaxFactor: request.input('reservationTaxFactor', null),
        reservationTax: request.input('reservationTax', 0),
        reservationTotal: request.input('reservationTotal', 0),
      } as Reservation

      // Verificamos si existe la reservación
      const currentReservation = await Reservation.query()
        .whereNull('reservation_deleted_at')
        .where('reservation_id', reservationId)
        .first()

      if (!currentReservation) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The reservation was not found',
          message: 'No reservation found with the entered ID',
          data: { reservationId },
        }
      }

      // Pasamos por un service que verifique la info (opcional)
      const reservationService = new ReservationService()
      const valid = await reservationService.verifyInfo(reservationData)
      if (valid.status !== 200) {
        response.status(valid.status)
        return {
          type: valid.type,
          title: valid.title,
          message: valid.message,
          data: { ...reservationData },
        }
      }

      // Actualizamos la reservación
      const updatedReservation = await reservationService.update(
        currentReservation,
        reservationData
      )
      response.status(200)
      return {
        type: 'success',
        title: 'Reservations',
        message: 'The reservation was updated successfully',
        data: { reservation: updatedReservation },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/reservations/{reservationId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Reservations
   *     summary: Delete reservation
   *     parameters:
   *       - in: path
   *         name: reservationId
   *         schema:
   *           type: number
   *         required: true
   *     responses:
   *       '200':
   *         description: Reservation deleted
   *       '404':
   *         description: Reservation not found
   *       '500':
   *         description: Server error
   */
  async delete({ request, response }: HttpContext) {
    try {
      const reservationId = request.param('reservationId')
      if (!reservationId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Reservation ID not found',
          message: 'Missing data to process',
          data: { reservationId },
        }
      }
      const currentReservation = await Reservation.query()
        .whereNull('reservation_deleted_at')
        .where('reservation_id', reservationId)
        .first()

      if (!currentReservation) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The reservation was not found',
          message: 'No reservation found with the entered ID',
          data: { reservationId },
        }
      }
      const reservationService = new ReservationService()
      const deleteReservation = await reservationService.delete(currentReservation)
      if (deleteReservation) {
        response.status(200)
        return {
          type: 'success',
          title: 'Reservations',
          message: 'The reservation was deleted successfully',
          data: { reservation: deleteReservation },
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/reservations/{reservationId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Reservations
   *     summary: Get reservation by id
   *     parameters:
   *       - in: path
   *         name: reservationId
   *         schema:
   *           type: number
   *         required: true
   *     responses:
   *       '200':
   *         description: Reservation found
   *       '400':
   *         description: Missing parameters
   *       '404':
   *         description: Reservation not found
   *       '500':
   *         description: Server error
   */
  async show({ request, response }: HttpContext) {
    try {
      const reservationId = request.param('reservationId')
      if (!reservationId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Reservation ID not found',
          message: 'Missing data to process',
          data: { reservationId },
        }
      }
      const reservationService = new ReservationService()
      const showReservation = await reservationService.show(reservationId)

      if (!showReservation) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The reservation was not found',
          message: 'No reservation found with the entered ID',
          data: { reservationId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Reservations',
          message: 'The reservation was found successfully',
          data: { reservation: showReservation },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }
}
