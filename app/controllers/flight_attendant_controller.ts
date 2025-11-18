import { HttpContext } from '@adonisjs/core/http'
import FlightAttendant from '#models/flight_attendant'
import FlightAttendantService from '#services/flight_attendant_service'
import EmployeeService from '#services/employee_service'
import PersonService from '#services/person_service'
import {
  createFlightAttendantValidator,
  updateFlightAttendantValidator,
} from '#validators/flight_attendant'
import { FlightAttendantFilterSearchInterface } from '../interfaces/flight_attendant_filter_search_interface.js'
import UploadService from '#services/upload_service'
import path from 'node:path'
import Env from '#start/env'
import Employee from '#models/employee'
import Person from '#models/person'
export default class FlightAttendantController {
  /**
   * @swagger
   * /api/flight-attendants:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Flight Attendants
   *     summary: get all
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
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
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
   *                   description: Response message
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async index({ request, response }: HttpContext) {
    try {
      const search = request.input('search')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const filters = {
        search: search,
        page: page,
        limit: limit,
      } as FlightAttendantFilterSearchInterface
      const flightAttendantService = new FlightAttendantService()
      const flightAttendants = await flightAttendantService.index(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Flight Attendants',
        message: 'The flight attendants were found successfully',
        data: {
          flightAttendants,
        },
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
   * /api/flight-attendants:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Flight Attendants
   *     summary: create new flight attendant
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *        multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               photo:
   *                 type: string
   *                 format: binary
   *                 description: Flight attendant photo
   *                 required: false
   *               flightAttendantHireDate:
   *                 type: string
   *                 format: date
   *                 description: Flight attendant hire date (YYYY-MM-DD)
   *                 required: true
   *                 default: ''
   *               employeeId:
   *                 type: integer
   *                 description: employee id
   *                 required: true
   *                 default: 0
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
      const data = await request.validateUsing(createFlightAttendantValidator)
      const employeeId = request.input('employeeId')
      let flightAttendantHireDate = request.input('flightAttendantHireDate')
      flightAttendantHireDate = (flightAttendantHireDate.split('T')[0] + ' 00:000:00').replace(
        '"',
        ''
      )
      const flightAttendant = {
        employeeId: employeeId,
        flightAttendantHireDate: flightAttendantHireDate,
      } as FlightAttendant
      const flightAttendantService = new FlightAttendantService()
      const valid = await flightAttendantService.verifyInfo(flightAttendant)
      if (valid.status !== 200) {
        response.status(valid.status)
        return {
          type: valid.type,
          title: valid.title,
          message: valid.message,
          data: { ...data },
        }
      }
      const exist = await flightAttendantService.verifyInfoExist(flightAttendant)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const validationOptions = {
        types: ['image'],
        size: '',
      }
      const photo = request.file('photo', validationOptions)
      if (photo) {
        const allowedExtensions = ['jpeg', 'jpg', 'png', 'webp']
        if (!allowedExtensions.includes(photo.extname ? photo.extname : '')) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Missing data to process',
            message: 'Please upload a image valid',
            data: photo,
          }
        }
        const uploadService = new UploadService()
        const fileName = `${new Date().getTime()}_${photo.clientName}`
        const fileUrl = await uploadService.fileUpload(photo, 'flight-attendants', fileName)
        flightAttendant.flightAttendantPhoto = fileUrl
      }
      const newFlightAttendant = await flightAttendantService.create(flightAttendant)
      response.status(201)
      return {
        type: 'success',
        title: 'Flight Attendants',
        message: 'The flight attendant was created successfully',
        data: { flightAttendant: newFlightAttendant },
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
   * /api/flight-attendants/{flightAttendantId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Flight Attendants
   *     summary: update flight attendant
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: flightAttendantId
   *         schema:
   *           type: number
   *         description: Flight attendant id
   *         required: true
   *     requestBody:
   *       content:
   *        multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               photo:
   *                 type: string
   *                 format: binary
   *                 description: Flight attendant photo
   *                 required: false
   *               flightAttendantHireDate:
   *                 type: string
   *                 format: date
   *                 description: Flight attendant hire date (YYYY-MM-DD)
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
      await request.validateUsing(updateFlightAttendantValidator)
      const flightAttendantId = request.param('flightAttendantId')
      let flightAttendantHireDate = request.input('flightAttendantHireDate')
      flightAttendantHireDate = (flightAttendantHireDate.split('T')[0] + ' 00:000:00').replace(
        '"',
        ''
      )
      const flightAttendant = {
        flightAttendantHireDate: flightAttendantHireDate,
      } as FlightAttendant
      if (!flightAttendantId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The flight attendant Id was not found',
          message: 'Missing data to process',
          data: { ...flightAttendant },
        }
      }
      const currentFlightAttendant = await FlightAttendant.query()
        .whereNull('flight_attendant_deleted_at')
        .where('flight_attendant_id', flightAttendantId)
        .first()
      if (!currentFlightAttendant) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The flight attendant was not found',
          message: 'The flight attendant was not found with the entered ID',
          data: { ...flightAttendant },
        }
      }
      const flightAttendantService = new FlightAttendantService()
      const validationOptions = {
        types: ['image'],
        size: '',
      }
      const photo = request.file('photo', validationOptions)
      flightAttendant.flightAttendantPhoto = currentFlightAttendant.flightAttendantPhoto
      if (photo) {
        const allowedExtensions = ['jpeg', 'jpg', 'png', 'webp']
        if (!allowedExtensions.includes(photo.extname ? photo.extname : '')) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Missing data to process',
            message: 'Please upload a image valid',
            data: photo,
          }
        }
        const uploadService = new UploadService()
        if (currentFlightAttendant.flightAttendantPhoto) {
          const fileNameWithExt = path.basename(currentFlightAttendant.flightAttendantPhoto)
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/flight-attendants/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
        }
        const fileName = `${new Date().getTime()}_${photo.clientName}`
        const fileUrl = await uploadService.fileUpload(photo, 'flight-attendants', fileName)
        flightAttendant.flightAttendantPhoto = fileUrl
      }
      const updateFlightAttendant = await flightAttendantService.update(
        currentFlightAttendant,
        flightAttendant
      )
      response.status(200)
      return {
        type: 'success',
        title: 'Flight Attendants',
        message: 'The flight attendant was updated successfully',
        data: { flightAttendant: updateFlightAttendant },
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
   * /api/flight-attendants/{flightAttendantId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Flight Attendants
   *     summary: delete flight attendant
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: flightAttendantId
   *         schema:
   *           type: number
   *         description: Flight attendant id
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
  async delete({ request, response, i18n }: HttpContext) {
    try {
      const flightAttendantId = request.param('flightAttendantId')
      if (!flightAttendantId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The flight attendant Id was not found',
          message: 'Missing data to process',
          data: { flightAttendantId },
        }
      }
      const currentFlightAttendant = await FlightAttendant.query()
        .whereNull('flight_attendant_deleted_at')
        .where('flight_attendant_id', flightAttendantId)
        .first()
      if (!currentFlightAttendant) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The flight attendant was not found',
          message: 'The flight attendant was not found with the entered ID',
          data: { flightAttendantId },
        }
      }
      const currentEmployee = await await Employee.query()
        .whereNull('employee_deleted_at')
        .where('employee_id', currentFlightAttendant.employeeId)
        .first()
      if (!currentEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { flightAttendantId },
        }
      }
      const currentPerson = await Person.query()
        .whereNull('person_deleted_at')
        .where('person_id', currentEmployee.personId)
        .first()
      if (!currentPerson) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The person was not found',
          message: 'The person was not found with the entered ID',
          data: { flightAttendantId },
        }
      }
      const flightAttendantService = new FlightAttendantService()
      const personService = new PersonService(i18n)
      const employeeService = new EmployeeService(i18n)
      const deletePerson = await personService.delete(currentPerson)
      const deleteEmployee = await employeeService.delete(currentEmployee)
      const deleteFlightAttendant = await flightAttendantService.delete(currentFlightAttendant)
      if (deleteFlightAttendant && deleteEmployee && deletePerson) {
        response.status(200)
        return {
          type: 'success',
          title: 'Flight Attendants',
          message: 'The flight attendant was deleted successfully',
          data: { flightAttendant: deleteFlightAttendant },
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
   * /api/flight-attendants/{flightAttendantId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Flight Attendants
   *     summary: get flight attendant by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: flightAttendantId
   *         schema:
   *           type: number
   *         description: Flight attendant id
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
      const flightAttendantId = request.param('flightAttendantId')
      if (!flightAttendantId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The flight attendant Id was not found',
          message: 'Missing data to process',
          data: { flightAttendantId },
        }
      }
      const flightAttendantService = new FlightAttendantService()
      const showFlightAttendant = await flightAttendantService.show(flightAttendantId)
      if (!showFlightAttendant) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The flight attendant was not found',
          message: 'The flight attendant was not found with the entered ID',
          data: { flightAttendantId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Flight Attendants',
          message: 'The flight attendant was found successfully',
          data: { flightAttendant: showFlightAttendant },
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
   * /api/flight-attendants/{flightAttendantId}/proceeding-files:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Flight Attendants
   *     summary: get proceeding files by flight attendant id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: flightAttendantId
   *         schema:
   *           type: number
   *         description: Flight Attendant id
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
  async getProceedingFiles({ request, response }: HttpContext) {
    try {
      const flightAttendantId = request.param('flightAttendantId')
      if (!flightAttendantId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The flight attendant Id was not found',
          data: { flightAttendantId },
        }
      }
      const flightAttendantService = new FlightAttendantService()
      const showFlightAttendant = await flightAttendantService.show(flightAttendantId)
      if (!showFlightAttendant) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The flight attendant was not found',
          message: 'The flight attendant was not found with the entered ID',
          data: { flightAttendantId },
        }
      }
      const proceedingFiles = await flightAttendantService.getProceedingFiles(flightAttendantId)
      response.status(200)
      return {
        type: 'success',
        title: 'Flight Attendants',
        message: 'The proceeding files were found successfully',
        data: { proceedingFiles: proceedingFiles },
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
