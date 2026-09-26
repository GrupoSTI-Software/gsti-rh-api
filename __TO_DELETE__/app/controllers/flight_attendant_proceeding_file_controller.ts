import FlightAttendantProceedingFile from '#models/flight_attendant_proceeding_file'
import FlightAttendantProceedingFileService from '#services/flight_attendant_proceeding_file_service'
import {
  createFlightAttendantProceedingFileValidator,
  updateFlightAttendantProceedingFileValidator,
} from '#validators/flight_attendant_proceeding_file'
import { HttpContext } from '@adonisjs/core/http'
import { FlightAttendantProceedingFileFilterInterface } from '../interfaces/flight_attendant_proceeding_file_filter_interface.js'

export default class FlightAttendantProceedingFileController {
  /**
   * @swagger
   * /api/flight-attendant-proceeding-files/:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Flight Attendants Proceeding Files
   *     summary: get all relation flightAttendant-proceedingFile
   *     produces:
   *       - application/json
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async index({ response }: HttpContext) {
    try {
      const flightAttendantProceedingFileService = new FlightAttendantProceedingFileService()
      const showFlightAttendantProceedingFiles = await flightAttendantProceedingFileService.index()
      response.status(200)
      return {
        type: 'success',
        title: 'Flight attendants proceeding files',
        message: 'The relation flightAttendant-proceedingFile were found successfully',
        data: { flightAttendantProceedingFiles: showFlightAttendantProceedingFiles },
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

  /**
   * @swagger
   * /api/flight-attendant-proceeding-files:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Flight Attendants Proceeding Files
   *     summary: create new relation flight attendant proceeding files
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               flightAttendantId:
   *                 type: number
   *                 description: Flight attendant id
   *                 required: true
   *                 default: ''
   *               proceedingFileId:
   *                 type: number
   *                 description: Proceeding file id
   *                 required: true
   *                 default: ''
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async store({ request, response }: HttpContext) {
    try {
      const flightAttendantId = request.input('flightAttendantId')
      const proceedingFileId = request.input('proceedingFileId')
      const flightAttendantProceedingFile = {
        flightAttendantId: flightAttendantId,
        proceedingFileId: proceedingFileId,
      } as FlightAttendantProceedingFile
      const flightAttendantProceedingFileService = new FlightAttendantProceedingFileService()
      const data = await request.validateUsing(createFlightAttendantProceedingFileValidator)
      const exist = await flightAttendantProceedingFileService.verifyInfoExist(
        flightAttendantProceedingFile
      )
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await flightAttendantProceedingFileService.verifyInfo(
        flightAttendantProceedingFile
      )
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const newFlightAttendantProceedingFile = await flightAttendantProceedingFileService.create(
        flightAttendantProceedingFile
      )
      if (newFlightAttendantProceedingFile) {
        response.status(201)
        return {
          type: 'success',
          title: 'Flight attendants proceeding files',
          message: 'The relation flightAttendant-proceedingFile was created successfully',
          data: { flightAttendantProceedingFile: newFlightAttendantProceedingFile },
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
   * /api/flight-attendant-proceeding-files/{flightAttendantProceedingFileId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Flight Attendants Proceeding Files
   *     summary: update relation flightAttendant-proceedingFile
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: flightAttendantProceedingFileId
   *         schema:
   *           type: number
   *         description: Flight attendant proceeding file id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               flightAttendantId:
   *                 type: number
   *                 description: Flight attendant id
   *                 required: true
   *                 default: ''
   *               proceedingFileId:
   *                 type: number
   *                 description: ProceedingFile id
   *                 required: true
   *                 default: ''
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async update({ request, response }: HttpContext) {
    try {
      const flightAttendantProceedingFileId = request.param('flightAttendantProceedingFileId')
      const flightAttendantId = request.input('flightAttendantId')
      const proceedingFileId = request.input('proceedingFileId')
      const flightAttendantProceedingFile = {
        flightAttendantProceedingFileId: flightAttendantProceedingFileId,
        flightAttendantId: flightAttendantId,
        proceedingFileId: proceedingFileId,
      } as FlightAttendantProceedingFile
      if (!flightAttendantProceedingFileId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The relation flightAttendant-proceedingFile Id was not found',
          message: 'Missing data to process',
          data: { ...flightAttendantProceedingFile },
        }
      }
      const currentFlightAttendantProceedingFile = await FlightAttendantProceedingFile.query()
        .whereNull('flight_attendant_proceeding_file_deleted_at')
        .where('flight_attendant_proceeding_file_id', flightAttendantProceedingFileId)
        .first()
      if (!currentFlightAttendantProceedingFile) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The relation flightAttendant-proceedingFile was not found',
          message: 'The relation flightAttendant-proceedingFile was not found with the entered ID',
          data: { ...flightAttendantProceedingFile },
        }
      }
      const flightAttendantProceedingFileService = new FlightAttendantProceedingFileService()
      const data = await request.validateUsing(updateFlightAttendantProceedingFileValidator)
      const exist = await flightAttendantProceedingFileService.verifyInfoExist(
        flightAttendantProceedingFile
      )
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await flightAttendantProceedingFileService.verifyInfo(
        flightAttendantProceedingFile
      )
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const updateFlightAttendantProceedingFile = await flightAttendantProceedingFileService.update(
        currentFlightAttendantProceedingFile,
        flightAttendantProceedingFile
      )
      if (updateFlightAttendantProceedingFile) {
        response.status(200)
        return {
          type: 'success',
          title: 'FlightAttendant proceeding files',
          message: 'The relation flightAttendant-proceedingFile was updated successfully',
          data: { flightAttendantProceedingFile: updateFlightAttendantProceedingFile },
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
   * /api/flight-attendant-proceeding-files/{flightAttendantProceedingFileId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Flight Attendants Proceeding Files
   *     summary: delete relation flight attendant proceeding files
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: flightAttendantProceedingFileId
   *         schema:
   *           type: number
   *         description: Flight attendant proceeding file id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async delete({ request, response }: HttpContext) {
    try {
      const flightAttendantProceedingFileId = request.param('flightAttendantProceedingFileId')
      if (!flightAttendantProceedingFileId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The relation flightAttendant-proceedingFile Id was not found',
          message: 'Missing data to process',
          data: { flightAttendantProceedingFileId },
        }
      }
      const currentFlightAttendantProceedingFile = await FlightAttendantProceedingFile.query()
        .whereNull('flight_attendant_proceeding_file_deleted_at')
        .where('flight_attendant_proceeding_file_id', flightAttendantProceedingFileId)
        .first()
      if (!currentFlightAttendantProceedingFile) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The relation flightAttendant-proceedingFile was not found',
          message: 'The relation flightAttendant-proceedingFile was not found with the entered ID',
          data: { flightAttendantProceedingFileId },
        }
      }
      const flightAttendantProceedingFileService = new FlightAttendantProceedingFileService()
      const deleteFlightAttendantProceedingFile = await flightAttendantProceedingFileService.delete(
        currentFlightAttendantProceedingFile
      )
      if (deleteFlightAttendantProceedingFile) {
        response.status(200)
        return {
          type: 'success',
          title: 'Flight attendants proceeding files',
          message: 'The relation flightAttendant-proceedingFile was deleted successfully',
          data: { flightAttendantProceedingFile: deleteFlightAttendantProceedingFile },
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
  /**
   * @swagger
   * /api/flight-attendant-proceeding-files/{flightAttendantProceedingFileId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Flight Attendants Proceeding Files
   *     summary: get relation flightAttendant-proceedingFile by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: flightAttendantProceedingFileId
   *         schema:
   *           type: number
   *         description: Flight attendant proceeding file id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async show({ request, response }: HttpContext) {
    try {
      const flightAttendantProceedingFileId = request.param('flightAttendantProceedingFileId')
      if (!flightAttendantProceedingFileId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The relation flightAttendant-proceedingFile Id was not found',
          message: 'Missing data to process',
          data: { flightAttendantProceedingFileId },
        }
      }
      const flightAttendantProceedingFileService = new FlightAttendantProceedingFileService()
      const showFlightAttendantProceedingFile = await flightAttendantProceedingFileService.show(
        flightAttendantProceedingFileId
      )
      if (!showFlightAttendantProceedingFile) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The relation flightAttendant-proceedingFile was not found',
          message: 'The relation flightAttendant-proceedingFile was not found with the entered ID',
          data: { flightAttendantProceedingFileId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Flight attendants proceeding files',
          message: 'The relation flightAttendant-proceedingFile was found successfully',
          data: { flightAttendantProceedingFile: showFlightAttendantProceedingFile },
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

  /**
   * @swagger
   * /api/flight-attendant-proceeding-files/get-expired-and-expiring:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Flight Attendants Proceeding Files
   *     summary: get expired and expiring proceeding files by date
   *     produces:
   *       - application/json
   *     parameters:
   *       - name: dateStart
   *         in: query
   *         required: false
   *         description: Date start (YYYY-MM-DD)
   *         format: date
   *         schema:
   *           type: string
   *       - name: dateEnd
   *         in: query
   *         required: false
   *         description: Date end (YYYY-MM-DD)
   *         format: date
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getExpiresAndExpiring({ request, response }: HttpContext) {
    try {
      const dateStart = request.input('dateStart')
      const dateEnd = request.input('dateEnd')
      const filters = {
        dateStart: dateStart,
        dateEnd: dateEnd,
      } as FlightAttendantProceedingFileFilterInterface
      const flightAttendantProceddingFileService = new FlightAttendantProceedingFileService()
      const flightAttendantProceedingFiles =
        await flightAttendantProceddingFileService.getExpiredAndExpiring(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Flight attendant proceeding files',
        message: 'The flight attendant proceeding files were found successfully',
        data: {
          flightAttendantProceedingFiles: flightAttendantProceedingFiles,
        },
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
