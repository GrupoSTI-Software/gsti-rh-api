import ShiftExceptionService from '#services/shift_exception_service'
import { DateTime } from 'luxon'
import { ShiftExceptionFilterInterface } from '../interfaces/shift_exception_filter_interface.js'
import ShiftException from '../models/shift_exception.js'
import { createShiftExceptionValidator } from '../validators/shift_exception.js'
import { HttpContext } from '@adonisjs/core/http'
import ExceptionType from '#models/exception_type'
import { ShiftExceptionErrorInterface } from '../interfaces/shift_exception_error_interface.js'
import VacationAuthorizationSignature from '#models/vacation_authorization_signature'
import ExceptionRequest from '#models/exception_request'
import Env from '#start/env'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import { ShiftExceptionGeneralErrorInterface } from '../interfaces/shift_exception_general_error_interface.js'
import NotificationEmailService from '#services/notification_email_service'

export default class ShiftExceptionController {
  /**
   * @swagger
   * /api/shift-exception:
   *   get:
   *     summary: Retrieve a list of shift exceptions
   *     tags: [ShiftException]
   *     responses:
   *       200:
   *         description: A list of shift exceptions
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/ShiftException'
   *       500:
   *         description: Server error
   */
  async index({ response }: HttpContext) {
    try {
      const shiftExceptions = await ShiftException.all()
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resources fetched',
        data: shiftExceptions,
      })
    } catch (error) {
      return response.status(500).json({
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error occurred',
        data: null,
      })
    }
  }
  /**
   * @swagger
   * /api/shift-exception:
   *   post:
   *     summary: Create a new shift exception
   *     tags: [ShiftException]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ShiftException'
   *     responses:
   *       201:
   *         description: Shift exception created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ShiftException'
   *       400:
   *         description: Validation error
   */
  async store({ auth, request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.input('employeeId')
      const shiftExceptionsDescription = request.input('shiftExceptionsDescription')
      let shiftExceptionsDate = request.input('shiftExceptionsDate')
      if (shiftExceptionsDate.toString().length <= 10) {
        shiftExceptionsDate = shiftExceptionsDate
          ? DateTime.fromJSDate(new Date(`${shiftExceptionsDate}T00:00:00.000-06:00`)).setZone(
              'UTC'
            )
          : null
      } else {
        shiftExceptionsDate = shiftExceptionsDate
          ? DateTime.fromJSDate(new Date(shiftExceptionsDate)).setZone('UTC')
          : null
      }
      const exceptionTypeId = request.input('exceptionTypeId')
      const vacationSettingId = request.input('vacationSettingId')
      const shiftExceptionCheckInTime = request.input('shiftExceptionCheckInTime')
      const shiftExceptionCheckOutTime = request.input('shiftExceptionCheckOutTime')
      const shiftExceptionEnjoymentOfSalary = request.input('shiftExceptionEnjoymentOfSalary')
      const shiftExceptionTimeByTime = request.input('shiftExceptionTimeByTime')
      let daysToApply = request.input('daysToApply', 1)
      if (!daysToApply) {
        daysToApply = 1
      }
      const shiftExceptionsSaved = [] as Array<ShiftException>
      const shiftExceptionsError = [] as Array<ShiftExceptionErrorInterface>
      for (let i = 0; i < daysToApply; i++) {
        const currentDate = shiftExceptionsDate.plus({ days: i }).toISODate()
        const shiftException = {
          employeeId: employeeId,
          shiftExceptionsDescription: shiftExceptionsDescription,
          shiftExceptionsDate: currentDate,
          exceptionTypeId: exceptionTypeId,
          vacationSettingId: vacationSettingId ? vacationSettingId : null,
          shiftExceptionCheckInTime: shiftExceptionCheckInTime ? shiftExceptionCheckInTime : null,
          shiftExceptionCheckOutTime: shiftExceptionCheckOutTime
            ? shiftExceptionCheckOutTime
            : null,
          shiftExceptionEnjoymentOfSalary: shiftExceptionEnjoymentOfSalary,
          shiftExceptionTimeByTime: shiftExceptionTimeByTime,
        } as ShiftException
        try {
          await request.validateUsing(createShiftExceptionValidator)
          const shiftExceptionService = new ShiftExceptionService(i18n)
          const verifyInfo = await shiftExceptionService.verifyInfo(shiftException)
          if (verifyInfo.status !== 200) {
            shiftExceptionsError.push({
              shiftExceptionsDate: currentDate,
              error: verifyInfo.message,
            })
          } else {
            const newShiftException = await shiftExceptionService.create(shiftException)
            if (newShiftException) {
              const rawHeaders = request.request.rawHeaders
              const userId = auth.user?.userId
              if (userId) {
                const logShiftException = await shiftExceptionService.createActionLog(
                  rawHeaders,
                  'store'
                )
                logShiftException.user_id = userId
                logShiftException.record_current = JSON.parse(JSON.stringify(newShiftException))
                const exceptionType = await ExceptionType.query()
                  .whereNull('exception_type_deleted_at')
                  .where('exception_type_slug', 'vacation')
                  .first()
                let table = 'log_shift_exceptions'
                if (exceptionType) {
                  if (exceptionType.exceptionTypeId === newShiftException.exceptionTypeId) {
                    table = 'log_vacations'
                  }
                }
                await shiftExceptionService.saveActionOnLog(logShiftException, table)
              }
              await newShiftException.load('exceptionType')
              await newShiftException.load('vacationSetting')
              shiftExceptionsSaved.push(newShiftException)

              // Send notification emails
              try {
                const notificationEmailService = new NotificationEmailService()
                const authToken = request.header('authorization')?.replace('Bearer ', '') || ''
                await notificationEmailService.sendVacationPermissionNotification(newShiftException, authToken)
              } catch (notificationError) {
                // Log notification error but don't fail the main process
                console.error('Error sending notification emails:', notificationError)
              }
            }
          }
        } catch (error) {
          shiftExceptionsError.push({
            shiftExceptionsDate: currentDate,
            error: error.message,
          })
        }
      }
      response.status(201)
      return {
        type: 'success',
        title: 'Shift exception',
        message: 'The shift exception was created successfully',
        data: {
          shiftExceptionsSaved: shiftExceptionsSaved,
          shiftExceptionsError: shiftExceptionsError,
        },
      }
    } catch (error) {
      console.error('Error:', error)
      return response.status(400).json({
        type: 'error',
        title: 'Validation error',
        message: error.messages,
        data: error,
      })
    }
  }
  /**
   * @swagger
   * /api/shift-exception/{id}:
   *   get:
   *     summary: Get a shift exception by ID
   *     tags: [ShiftException]
   *     parameters:
   *       - in: path
   *         name: id
   *         schema:
   *           type: integer
   *         required: true
   *         description: ID of the shift exception to retrieve
   *     responses:
   *       200:
   *         description: Shift exception fetched
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ShiftException'
   *       404:
   *         description: Shift exception not found
   */
  async show({ params, response }: HttpContext) {
    try {
      const shiftException = await ShiftException.findOrFail(params.id)
      await shiftException.load('exceptionType')
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resource fetched',
        data: shiftException,
      })
    } catch (error) {
      return response.status(404).json({
        type: 'error',
        title: 'Not found',
        message: 'Resource not found',
        data: null,
      })
    }
  }
  /**
   * @swagger
   * /api/shift-exception/{id}:
   *   put:
   *     summary: Update a shift exception by ID
   *     tags: [ShiftException]
   *     parameters:
   *       - in: path
   *         name: id
   *         schema:
   *           type: integer
   *         required: true
   *         description: ID of the shift exception to update
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ShiftException'
   *     responses:
   *       200:
   *         description: Shift exception updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ShiftException'
   *       400:
   *         description: Validation error
   *       404:
   *         description: Shift exception not found
   */
  async update({ auth, params, request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.input('employeeId')
      const shiftExceptionsDescription = request.input('shiftExceptionsDescription')
      let shiftExceptionsDate = request.input('shiftExceptionsDate')
      if (shiftExceptionsDate.toString().length <= 10) {
        shiftExceptionsDate = shiftExceptionsDate
          ? DateTime.fromJSDate(new Date(`${shiftExceptionsDate}T00:00:00.000-06:00`))
              .setZone('UTC')
              .toJSDate()
          : null
      } else {
        shiftExceptionsDate = shiftExceptionsDate
          ? DateTime.fromJSDate(new Date(shiftExceptionsDate)).setZone('UTC').toJSDate()
          : null
      }
      const exceptionTypeId = request.input('exceptionTypeId')
      const vacationSettingId = request.input('vacationSettingId')
      const shiftExceptionCheckInTime = request.input('shiftExceptionCheckInTime')
      const shiftExceptionCheckOutTime = request.input('shiftExceptionCheckOutTime')
      const shiftExceptionEnjoymentOfSalary = request.input('shiftExceptionEnjoymentOfSalary')
      const shiftExceptionTimeByTime = request.input('shiftExceptionTimeByTime')
      await request.validateUsing(createShiftExceptionValidator)
      const shiftExceptionService = new ShiftExceptionService(i18n)
      const currentShiftException = await ShiftException.findOrFail(params.id)
      const previousShiftException = JSON.parse(JSON.stringify(currentShiftException))
      const shiftException = {
        shiftExceptionId: params.id,
        employeeId: employeeId,
        shiftExceptionsDescription: shiftExceptionsDescription,
        shiftExceptionsDate: shiftExceptionsDate,
        exceptionTypeId: exceptionTypeId,
        vacationSettingId: vacationSettingId ? vacationSettingId : null,
        shiftExceptionCheckInTime: shiftExceptionCheckInTime ? shiftExceptionCheckInTime : null,
        shiftExceptionCheckOutTime: shiftExceptionCheckOutTime ? shiftExceptionCheckOutTime : null,
        shiftExceptionEnjoymentOfSalary: shiftExceptionEnjoymentOfSalary,
        shiftExceptionTimeByTime: shiftExceptionTimeByTime,
      } as ShiftException
      const verifyInfo = await shiftExceptionService.verifyInfo(shiftException)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...shiftException },
        }
      }
      const updateShiftException = await shiftExceptionService.update(
        currentShiftException,
        shiftException
      )
      if (updateShiftException) {
        const rawHeaders = request.request.rawHeaders
        const userId = auth.user?.userId
        if (userId) {
          const logShiftException = await shiftExceptionService.createActionLog(
            rawHeaders,
            'update'
          )
          logShiftException.user_id = userId
          logShiftException.record_current = JSON.parse(JSON.stringify(updateShiftException))
          logShiftException.record_previous = previousShiftException

          const exceptionType = await ExceptionType.query()
            .whereNull('exception_type_deleted_at')
            .where('exception_type_slug', 'vacation')
            .first()
          let table = 'log_shift_exceptions'
          if (exceptionType) {
            if (exceptionType.exceptionTypeId === updateShiftException.exceptionTypeId) {
              table = 'log_vacations'
            }
          }
          await shiftExceptionService.saveActionOnLog(logShiftException, table)
        }
        await updateShiftException.load('exceptionType')
        await updateShiftException.load('vacationSetting')
        response.status(201)
        return {
          type: 'success',
          title: 'Shift exception',
          message: 'The shift exception was updated successfully',
          data: { shiftException: updateShiftException },
        }
      }
    } catch (error) {
      return response.status(400).json({
        type: 'error',
        title: 'Validation error',
        message: error,
        data: null,
      })
    }
  }
  /**
   * @swagger
   * /api/shift-exception/{id}:
   *   delete:
   *     summary: Delete a shift exception by ID
   *     tags: [ShiftException]
   *     parameters:
   *       - in: path
   *         name: id
   *         schema:
   *           type: integer
   *         required: true
   *         description: ID of the shift exception to delete
   *     responses:
   *       200:
   *         description: Shift exception deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ShiftException'
   *       404:
   *         description: Shift exception not found
   */
  async destroy({ auth, request, params, response, i18n }: HttpContext) {
    try {
      const shiftException = await ShiftException.findOrFail(params.id)

      // Cambiar findByOrFail por findBy
      const signature = await VacationAuthorizationSignature.findBy('shift_exception_id', shiftException.shiftExceptionId)

      // Solo procesar si existe la firma y tiene exceptionRequestId
      if (signature && signature.exceptionRequestId) {
        const exceptionRequest = await ExceptionRequest.query()
          .where('exception_request_id', signature.exceptionRequestId)
          .where('exception_type_id', shiftException.exceptionTypeId)
          .where('exception_request_status', 'accepted')
          .whereNull('exception_request_deleted_at')

        if (exceptionRequest.length > 0) {
          await exceptionRequest[0].delete()
        }
      }

      await shiftException.delete()

      const shiftExceptionService = new ShiftExceptionService(i18n)
      const exceptionDate = shiftException.shiftExceptionsDate
      const date = typeof exceptionDate === 'string' ? new Date(exceptionDate) : exceptionDate

      await shiftExceptionService.updateAssistCalendar(shiftException.employeeId, date)

      const userId = auth.user?.userId

      if (userId) {
        const rawHeaders = request.request.rawHeaders
        const logShiftException = await shiftExceptionService.createActionLog(rawHeaders, 'delete')
        logShiftException.user_id = userId
        logShiftException.record_current = JSON.parse(JSON.stringify(shiftException))

        const exceptionType = await ExceptionType.query()
          .whereNull('exception_type_deleted_at')
          .where('exception_type_slug', 'vacation')
          .first()

        let table = 'log_shift_exceptions'
        if (exceptionType) {
          if (exceptionType.exceptionTypeId === shiftException.exceptionTypeId) {
            table = 'log_vacations'
          }
        }
        await shiftExceptionService.saveActionOnLog(logShiftException, table)
      }

      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resource deleted',
        data: shiftException.toJSON(),
      })
    } catch (error) {
      return response.status(404).json({
        type: 'error',
        title: 'Not found',
        message: 'Resource not found',
        data: null,
      })
    }
  }

  /**
   * @swagger
   * /api/shift-exception-employee/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - ShiftException
   *     summary: get shifts exceptions by employee
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *       - name: exceptionTypeId
   *         in: query
   *         required: false
   *         description: Exception type id
   *         schema:
   *           type: number
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
  async getByEmployee({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      const exceptionTypeId = request.input('exceptionTypeId')
      const dateStart = request.input('dateStart')
      const dateEnd = request.input('dateEnd')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }
      const filters = {
        employeeId: employeeId,
        exceptionTypeId: exceptionTypeId,
        dateStart: dateStart,
        dateEnd: dateEnd,
      } as ShiftExceptionFilterInterface
      const shiftExceptionService = new ShiftExceptionService(i18n)
      const shiftExceptions = await shiftExceptionService.getByEmployee(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Shift exceptions',
        message: 'The shift exceptions were found successfully',
        data: {
          shiftExceptions: shiftExceptions,
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

  /**
   * @swagger
   * /api/shift-exceptions/{shiftExceptionId}/evidences:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Shift Exceptions
   *     summary: get evidences by shift exception id
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
  async getEvidences({ request, response, i18n }: HttpContext) {
    try {
      const shiftExceptionId = request.param('shiftExceptionId')

      if (!shiftExceptionId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The shift exception Id was not found',
          data: { shiftExceptionId },
        }
      }

      const shiftExceptionService = new ShiftExceptionService(i18n)
      const showShiftException = await shiftExceptionService.show(shiftExceptionId)

      if (!showShiftException) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The shift exception was not found',
          message: 'The shift exception was not found with the entered ID',
          data: { shiftExceptionId },
        }
      }

      const evidences = await shiftExceptionService.getEvidences(shiftExceptionId)

      response.status(200)
      return {
        type: 'success',
        title: 'Shift exceptions',
        message: 'The evidences were found successfully',
        data: { data: evidences },
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
   * /api/shift-exception-apply-general:
   *   post:
   *     summary: Create a new shift exception general
   *     tags: [ShiftException]
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               exceptionTypeId:
   *                 type: number
   *                 description: Exception type id
   *                 required: true
   *                 default: ''
   *               shiftExceptionsDate:
   *                 type: string
   *                 format: date
   *                 description: Date of the shift exception
   *                 required: true
   *                 default: ''
   *               shiftExceptionCheckInTime:
   *                 type: string
   *                 format: time
   *                 description: Time check in
   *                 nullable: true
   *                 required: false
   *                 default: ''
   *               shiftExceptionCheckOutTime:
   *                 type: string
   *                 format: time
   *                 description: Time check out
   *                 nullable: true
   *                 required: false
   *                 default: ''
   *               shiftExceptionDescription:
   *                 type: string
   *                 description: Description of the shift exception
   *                 required: false
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
   async applyExceptionGeneral({ auth, request, response, i18n }: HttpContext) {
    try {
      const exceptionTypeId = request.input('exceptionTypeId')
      const shiftExceptionsDescription = request.input('shiftExceptionsDescription')
      let shiftExceptionsDate = request.input('shiftExceptionsDate')
      if (shiftExceptionsDate.toString().length <= 10) {
        shiftExceptionsDate = shiftExceptionsDate
          ? DateTime.fromJSDate(new Date(`${shiftExceptionsDate}T00:00:00.000-06:00`)).setZone(
              'UTC'
            )
          : null
      } else {
        shiftExceptionsDate = shiftExceptionsDate
          ? DateTime.fromJSDate(new Date(shiftExceptionsDate)).setZone('UTC')
          : null
      }
      const shiftExceptionsDateISO = shiftExceptionsDate ? shiftExceptionsDate.toISODate() : null
      if (!exceptionTypeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The exception type Id was not found',
          data: { exceptionTypeId },
        }
      }

      const existExceptionType = await ExceptionType.query()
        .whereNull('exception_type_deleted_at')
        .where('exception_type_id', exceptionTypeId)
        .first()

      if (!existExceptionType && exceptionTypeId) {
        return {
          status: 400,
          type: 'warning',
          title: 'The exception type was not found',
          message: 'The exception type was not found with the entered ID',
          data: { ...exceptionTypeId },
        }
      }

      const shiftExceptionCheckInTime = request.input('shiftExceptionCheckInTime')
      const shiftExceptionCheckOutTime = request.input('shiftExceptionCheckOutTime')
      const employeeIdsInput = request.input('employeeIds')
      const departmentIdInput = request.input('departmentId')
      const positionIdInput = request.input('positionId')

      const employeeIds = Array.isArray(employeeIdsInput)
        ? Array.from(new Set(
          employeeIdsInput
            .map((id) => {
              const parsed = Number(id)
              return Number.isFinite(parsed) ? parsed : null
            })
            .filter((id): id is number => !!id && id > 0)
        ))
        : []

      const departmentId = departmentIdInput !== undefined && departmentIdInput !== null && departmentIdInput !== ''
        ? Number(departmentIdInput)
        : null

      const positionId = positionIdInput !== undefined && positionIdInput !== null && positionIdInput !== ''
        ? Number(positionIdInput)
        : null

      const shiftExceptionsSaved = [] as Array<ShiftException>
      const shiftExceptionsError = [] as Array<ShiftExceptionGeneralErrorInterface>

      const businessConf = `${Env.get('SYSTEM_BUSINESS')}`
      const businessList = businessConf.split(',')
      const businessUnits = await BusinessUnit.query()
        .where('business_unit_active', 1)
        .whereIn('business_unit_slug', businessList)


      const businessUnitsList = businessUnits.map((business) => business.businessUnitId)

      const employeesQuery = Employee.query()
        .whereIn('businessUnitId', businessUnitsList)
        .preload('person')
        .orderBy('employee_id')

      if (employeeIds.length > 0) {
        employeesQuery.whereIn('employee_id', employeeIds)
      } else {
        if (departmentId) {
          employeesQuery.where('department_id', departmentId)
        }
        if (positionId) {
          employeesQuery.where('position_id', positionId)
        }
      }

      const employees = await employeesQuery
      const results = await Promise.allSettled(
        employees.map(async (employee) => {
          const shiftException = {
              employeeId: employee.employeeId,
              shiftExceptionsDescription: shiftExceptionsDescription,
              shiftExceptionsDate: shiftExceptionsDateISO,
              exceptionTypeId: exceptionTypeId,
              shiftExceptionCheckInTime: shiftExceptionCheckInTime,
              shiftExceptionCheckOutTime: shiftExceptionCheckOutTime ? shiftExceptionCheckOutTime : null,
              shiftExceptionEnjoymentOfSalary: 1
            } as ShiftException

          try {
            const shiftExceptionService = new ShiftExceptionService(i18n)
            const verifyInfo = await shiftExceptionService.verifyInfo(shiftException)

            if (verifyInfo.status !== 200) {
              return {
                success: false,
                data: {
                  shiftExceptionsDate: shiftExceptionsDateISO,
                  employee,
                  error: verifyInfo.message,
                },
              }
            }

            const newShiftException = await shiftExceptionService.create(shiftException)

            if (!newShiftException) {
              throw new Error('Failed to create shift exception')
            }

            const userId = auth.user?.userId
            if (userId) {
              const rawHeaders = request.request.rawHeaders
              const logShiftException = await shiftExceptionService.createActionLog(rawHeaders, 'store')
              logShiftException.user_id = userId
              logShiftException.record_current = JSON.parse(JSON.stringify(newShiftException))

              let table = 'log_shift_exceptions'

              const exceptionType = await ExceptionType.query()
                .whereNull('exception_type_deleted_at')
                .where('exception_type_slug', 'vacation')
                .first()

              if (exceptionType && exceptionType.exceptionTypeId === newShiftException.exceptionTypeId) {
                table = 'log_vacations'
              }

              await shiftExceptionService.saveActionOnLog(logShiftException, table)
            }

            await newShiftException.load('exceptionType')

            return {
              success: true,
              data: newShiftException,
            }
          } catch (error) {
            return {
              success: false,
              data: {
                shiftExceptionsDate: shiftExceptionsDateISO,
                employee,
                error: error.message,
              },
            }
          }
        })
      )

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const res = result.value

          if (res.success) {
            shiftExceptionsSaved.push(res.data as ShiftException)
          } else {
            shiftExceptionsError.push(res.data as {
              shiftExceptionsDate: string
              employee: Employee
              error: any
            })
          }
        } else {
            shiftExceptionsError.push({
              shiftExceptionsDate: shiftExceptionsDateISO,
            employee: {} as Employee,
            error: result.reason?.message || 'Unexpected error',
          })
        }
      }


      response.status(201)
      return {
        type: 'success',
        title: 'Shift exception',
        message: 'The shift exception was created successfully',
        data: {
          shiftExceptionsSaved: shiftExceptionsSaved,
          shiftExceptionsError: shiftExceptionsError,
        },
      }
    } catch (error) {
      console.error('Error:', error)
      return response.status(400).json({
        type: 'error',
        title: 'Validation error',
        message: error.messages,
        data: error,
      })
    }
  }
}
