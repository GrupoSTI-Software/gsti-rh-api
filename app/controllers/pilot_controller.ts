import { HttpContext } from '@adonisjs/core/http'
import Pilot from '#models/pilot'
import PilotService from '#services/pilot_service'
import EmployeeService from '#services/employee_service'
import PersonService from '#services/person_service'
import { createPilotValidator } from '#validators/pilot'
import { PilotFilterSearchInterface } from '../interfaces/pilot_filter_search_interface.js'
import UploadService from '#services/upload_service'
import path from 'node:path'
import Env from '#start/env'
import Employee from '#models/employee'
import Person from '#models/person'
export default class PilotController {
  /**
   * @swagger
   * /api/pilots:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Pilots
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
      } as PilotFilterSearchInterface
      const pilotService = new PilotService()
      const pilots = await pilotService.index(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Pilots',
        message: 'The pilots were found successfully',
        data: {
          pilots,
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
   * /api/pilots:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Pilots
   *     summary: create new pilot
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
   *                 description: The pilot photo
   *                 required: false
   *               pilotHireDate:
   *                 type: string
   *                 format: date
   *                 description: Pilot hire date (YYYY-MM-DD)
   *                 required: true
   *                 default: ''
   *               employeeId:
   *                 type: integer
   *                 description: Employee id
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
      const employeeId = request.input('employeeId')
      let pilotHireDate = request.input('pilotHireDate')
      pilotHireDate = (pilotHireDate.split('T')[0] + ' 00:000:00').replace('"', '')
      const pilot = {
        employeeId: employeeId,
        pilotHireDate: pilotHireDate,
      } as Pilot
      const pilotService = new PilotService()
      const data = await request.validateUsing(createPilotValidator)
      const valid = await pilotService.verifyInfo(pilot)
      if (valid.status !== 200) {
        response.status(valid.status)
        return {
          type: valid.type,
          title: valid.title,
          message: valid.message,
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
        const fileUrl = await uploadService.fileUpload(photo, 'pilots', fileName)
        pilot.pilotPhoto = fileUrl
      }
      const newPilot = await pilotService.create(pilot)
      response.status(201)
      return {
        type: 'success',
        title: 'Pilots',
        message: 'The pilot was created successfully',
        data: { pilot: newPilot },
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
   * /api/pilots/{pilotId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Pilots
   *     summary: update pilot
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: pilotId
   *         schema:
   *           type: number
   *         description: Pilot id
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
   *                 description: The pilot photo
   *                 required: false
   *               pilotHireDate:
   *                 type: string
   *                 format: date
   *                 description: Pilot hire date (YYYY-MM-DD)
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
      const pilotId = request.param('pilotId')
      let pilotHireDate = request.input('pilotHireDate')
      pilotHireDate = (pilotHireDate.split('T')[0] + ' 00:000:00').replace('"', '')
      const pilot = {
        pilotHireDate: pilotHireDate,
      } as Pilot
      if (!pilotId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The pilot Id was not found',
          message: 'Missing data to process',
          data: { ...pilot },
        }
      }
      const currentPilot = await Pilot.query()
        .whereNull('pilot_deleted_at')
        .where('pilot_id', pilotId)
        .first()
      if (!currentPilot) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The pilot was not found',
          message: 'The pilot was not found with the entered ID',
          data: { ...pilot },
        }
      }
      const pilotService = new PilotService()
      const validationOptions = {
        types: ['image'],
        size: '',
      }
      const photo = request.file('photo', validationOptions)
      pilot.pilotPhoto = currentPilot.pilotPhoto
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
        if (currentPilot.pilotPhoto) {
          const fileNameWithExt = path.basename(currentPilot.pilotPhoto)
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/pilots/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
        }
        const fileName = `${new Date().getTime()}_${photo.clientName}`
        const fileUrl = await uploadService.fileUpload(photo, 'pilots', fileName)
        pilot.pilotPhoto = fileUrl
      }
      const updatePilot = await pilotService.update(currentPilot, pilot)
      response.status(200)
      return {
        type: 'success',
        title: 'Pilots',
        message: 'The pilot was updated successfully',
        data: { pilot: updatePilot },
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
   * /api/pilots/{pilotId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Pilots
   *     summary: delete pilot
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: pilotId
   *         schema:
   *           type: number
   *         description: Pilot id
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
      const pilotId = request.param('pilotId')
      if (!pilotId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The pilot Id was not found',
          message: 'Missing data to process',
          data: { pilotId },
        }
      }
      const currentPilot = await Pilot.query()
        .whereNull('pilot_deleted_at')
        .where('pilot_id', pilotId)
        .first()
      if (!currentPilot) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The pilot was not found',
          message: 'The pilot was not found with the entered ID',
          data: { pilotId },
        }
      }
      const currentEmployee = await await Employee.query()
        .whereNull('employee_deleted_at')
        .where('employee_id', currentPilot.employeeId)
        .first()
      if (!currentEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId: currentPilot.employeeId },
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
          data: { personId: currentEmployee.personId },
        }
      }
      const personService = new PersonService(i18n)
      const employeeService = new EmployeeService(i18n)
      const pilotService = new PilotService()
      const deletePerson = await personService.delete(currentPerson)
      const deleteEmployee = await employeeService.delete(currentEmployee)
      const deletePilot = await pilotService.delete(currentPilot)
      if (deletePilot && deleteEmployee && deletePerson) {
        response.status(200)
        return {
          type: 'success',
          title: 'Pilots',
          message: 'The pilot was deleted successfully',
          data: { pilot: deletePilot },
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
   * /api/pilots/{pilotId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Pilots
   *     summary: get pilot by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: pilotId
   *         schema:
   *           type: number
   *         description: Pilot id
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
      const pilotId = request.param('pilotId')
      if (!pilotId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The pilot Id was not found',
          message: 'Missing data to process',
          data: { pilotId },
        }
      }
      const pilotService = new PilotService()
      const showPilot = await pilotService.show(pilotId)
      if (!showPilot) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The pilot was not found',
          message: 'The pilot was not found with the entered ID',
          data: { pilotId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Pilots',
          message: 'The pilot was found successfully',
          data: { pilot: showPilot },
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
   * /api/pilots/{pilotId}/proceeding-files:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Pilots
   *     summary: get proceeding files by pilot id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: pilotId
   *         schema:
   *           type: number
   *         description: Pilot id
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
      const pilotId = request.param('pilotId')
      if (!pilotId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The pilot Id was not found',
          message: 'Missing data to process',
          data: { pilotId },
        }
      }
      const pilotService = new PilotService()
      const showPilot = await pilotService.show(pilotId)
      if (!showPilot) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The pilot was not found',
          message: 'The pilot was not found with the entered ID',
          data: { pilotId },
        }
      }
      const proceedingFiles = await pilotService.getProceedingFiles(pilotId)
      response.status(200)
      return {
        type: 'success',
        title: 'Pilots',
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
