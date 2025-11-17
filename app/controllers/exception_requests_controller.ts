/* eslint-disable prettier/prettier */
import { HttpContext } from '@adonisjs/core/http'
import ExceptionRequest from '../models/exception_request.js'
import { formatResponse } from '../helpers/responseFormatter.js'
import {
  storeExceptionRequestValidator,
  updateExceptionRequestValidator,
} from '#validators/exception_request'
import env from '#start/env'
import mail from '@adonisjs/mail/services/main'
import Employee from '#models/employee'
import ExceptionType from '#models/exception_type'
import ShiftException from '#models/shift_exception'
import ShiftExceptionService from '#services/shift_exception_service'
import { DateTime } from 'luxon'
import Ws from '#services/ws'
import User from '#models/user'
import { ExceptionRequestErrorInterface } from '../interfaces/exception_request_error_interface.js'
import SystemSettingService from '#services/system_setting_service'
import SystemSetting from '#models/system_setting'
import NotificationEmailService from '#services/notification_email_service'

export default class ExceptionRequestsController {
  /**
   * @swagger
   * tags:
   *   name: ExceptionRequests
   *   description: API for managing exception requests
   */
  /**
   * @swagger
   * /api/exception-requests/{id}/status:
   *   post:
   *     summary: Update the status of a specific exception request
   *     tags: [ExceptionRequests]
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: ID of the exception request
   *         schema:
   *           type: integer
   *       - name: status
   *         in: body
   *         required: true
   *         description: The new status of the exception request
   *         schema:
   *           type: object
   *           required:
   *             - status
   *           properties:
   *             status:
   *               type: string
   *               enum: [accepted, refused]
   *               example: accepted
   *     responses:
   *       200:
   *         description: Status updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: Status updated successfully
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: integer
   *       400:
   *         description: Invalid status
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 error:
   *                   type: string
   *                   example: Invalid status. Only "accepted" or "refused" are allowed.
   *       404:
   *         description: ExceptionRequest not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 error:
   *                   type: string
   *                   example: ExceptionRequest not found
   */
  async updateStatus({ auth, request, params, response, i18n }: HttpContext) {
    const { status, description } = request.only(['status', 'description'])

    if (status !== 'accepted' && status !== 'refused') {
      return response.status(400).json({
        error: 'Invalid status. Only "accepted" or "refused" are allowed.',
      })
    }
    const exceptionRequest = await ExceptionRequest.find(params.id)
    if (!exceptionRequest) {
      return response.status(404).json({
        error: 'ExceptionRequest not found',
      })
    }
    exceptionRequest.exceptionRequestStatus = status
    await exceptionRequest.save()

    if (status === 'accepted' || status === 'refused') {
      if (exceptionRequest.userId) {
        const user = await User.query()
          .where('user_id', exceptionRequest.userId)
          .whereNull('user_deleted_at')
          .preload('person')
          .first()
        if (user) {
          if (user.userEmail) {
            const userEmail = env.get('SMTP_USERNAME')
            if (userEmail) {
              let tradeName = 'BO'
              let backgroundImageLogo = `${env.get('BACKGROUND_IMAGE_LOGO')}`
              const systemSettingService = new SystemSettingService()
              const systemSettingActive = (await systemSettingService.getActive()) as unknown as SystemSetting
              if (systemSettingActive) {
                if ( systemSettingActive.systemSettingLogo) {
                  backgroundImageLogo = systemSettingActive.systemSettingLogo
                }
                if ( systemSettingActive.systemSettingTradeName) {
                  tradeName = systemSettingActive.systemSettingTradeName
                }
              }
              await mail.send((message) => {
                message
                  .to(user.userEmail)
                  .from(userEmail, tradeName)
                  .subject(
                    `${tradeName}, Exception Request - ${`${exceptionRequest.exceptionRequestId}`.padStart(5, '0')}`
                  )
                  .htmlView('emails/update_status_mail', {
                    newStatus: status,
                    newDescription: description,
                    userName: user.person
                      ? `${user.person.personFirstname} ${user.person.personLastname} ${user.person.personSecondLastname}`
                      : 'User',
                    backgroundImageLogo,
                  })
              })
            }
          }
        }
      }
    }
    if (status === 'accepted') {
      const shiftExceptionService = new ShiftExceptionService(i18n)
      const shiftException = {
        shiftExceptionId: 0,
        employeeId: exceptionRequest.employeeId,
        shiftExceptionsDescription: exceptionRequest.exceptionRequestDescription,
        shiftExceptionsDate: exceptionRequest.requestedDate
          ? DateTime.fromJSDate(new Date(exceptionRequest.requestedDate.toString()))
              .setZone('UTC')
              .toJSDate()
          : null,
        exceptionTypeId: exceptionRequest.exceptionTypeId,
        vacationSettingId: null,
        shiftExceptionCheckInTime: exceptionRequest.exceptionRequestCheckInTime,
        shiftExceptionCheckOutTime: exceptionRequest.exceptionRequestCheckOutTime,
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
      const newShiftException = await shiftExceptionService.create(shiftException)
      if (newShiftException) {
        const rawHeaders = request.request.rawHeaders
        const userId = auth.user?.userId
        if (userId) {
          const logShiftException = await shiftExceptionService.createActionLog(rawHeaders, 'store')
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

        // Send notification emails
        try {
          const notificationEmailService = new NotificationEmailService()
          const authToken = request.header('authorization')?.replace('Bearer ', '') || ''
          await notificationEmailService.sendExceptionRequestNotification(exceptionRequest, authToken)
        } catch (notificationError) {
          // Log notification error but don't fail the main process
          console.error('Error sending notification emails:', notificationError)
        }
      }
    }
    return response.status(200).json({
      message: 'Status updated successfully',
      data: exceptionRequest,
    })
  }
  /**
   * @swagger
   * /api/exception-requests:
   *   get:
   *     summary: Get a list of exception requests
   *     tags: [ExceptionRequests]
   *     parameters:
   *       - name: page
   *         in: query
   *         required: false
   *         description: The page number
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: false
   *         description: The number of records per page
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: A list of exception requests
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     total:
   *                       type: integer
   *                     per_page:
   *                       type: integer
   *                     current_page:
   *                       type: integer
   *                     last_page:
   *                       type: integer
   *                     first_page:
   *                       type: integer
   *                     resources:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           employeeId:
   *                             type: integer
   *                           exceptionTypeId:
   *                             type: integer
   *                           exceptionRequestStatus:
   *                             type: string
   *                           exceptionRequestDescription:
   *                             type: string
   */

  async index({ request, response }: HttpContext) {
    const page = request.input('page', 1)
    const limit = request.input('limit', 10)
    const employeeId = request.input('employeeId')
    const query = ExceptionRequest.query()
    if (employeeId) {
      query.where('employeeId', employeeId)
    }
    const exceptionRequests = await query.paginate(page, limit)
    return response.status(200).json(
      formatResponse(
        'success',
        'Successfully fetched',
        'Resources fetched',
        exceptionRequests.all(),
        {
          total: exceptionRequests.total,
          per_page: exceptionRequests.perPage,
          current_page: exceptionRequests.currentPage,
          last_page: exceptionRequests.lastPage,
          first_page: 1,
        }
      )
    )
  }
  /**
   * @swagger
   * /api/exception-requests:
   *   post:
   *     summary: Create a new exception request
   *     tags: [ExceptionRequests]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeId:
   *                 type: integer
   *               exceptionTypeId:
   *                 type: integer
   *               exceptionRequestStatus:
   *                 type: string
   *                 enum: [requested, pending, accepted, refused]
   *               exceptionRequestDescription:
   *                 type: string
   *                 maxLength: 255
   *               requestedDate:
   *                 type: string
   *                 example: "2024-11-15 14:00:00"
   *               exceptionRequestCheckInTime:
   *                 type: string
   *                 example: "14:00:00"
   *               exceptionRequestCheckOutTime:
   *                 type: string
   *                 example: "14:00:00"
   *               daysToApply:
   *                 type: number
   *                 example: 0
   *     responses:
   *       201:
   *         description: Exception request created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     employeeId:
   *                       type: integer
   *                     exceptionTypeId:
   *                       type: integer
   *                     exceptionRequestStatus:
   *                       type: string
   *                     exceptionRequestDescription:
   *                       type: string
   */

  async store({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      response.status(404)
      return {
        type: 'warning',
        title: 'User',
        message: 'User not found',
        data: { user: {} },
      }
    }
    const data = await request.validateUsing(storeExceptionRequestValidator)
    const employee = await Employee.query()
      .where('employeeId', data.employeeId)
      .whereNull('deletedAt')
      .first()
    if (!employee) {
      return response.status(404).json({
        error: 'Employee not found or has been deleted',
      })
    }
    const exceptionType = await ExceptionType.query()
      .where('exceptionTypeId', data.exceptionTypeId)
      .whereNull('deletedAt')
      .first()

    if (!exceptionType) {
      return response.status(404).json({
        error: 'Exception type not found or has been deleted',
      })
    }
    let daysToApply = request.input('daysToApply', 1)
    if (!daysToApply) {
      daysToApply = 1
    }
    const exceptionRequestsSaved = [] as Array<ExceptionRequest>
    const exceptionRequestsError = [] as Array<ExceptionRequestErrorInterface>
    const exceptionRequestDate = data.requestedDate
    for (let i = 0; i < daysToApply; i++) {
      const currentDate = exceptionRequestDate.plus({ days: i }).toISODate()
      if (currentDate) {
        try {
          const existingRequest = await ExceptionRequest.query()
            .where('employee_id', data.employeeId)
            .where('requested_date', currentDate)
            .whereNot('exception_request_status', 'refused')
            .first()

          if (existingRequest) {
            exceptionRequestsError.push({
              requestedDate: currentDate,
              error:
                'An exception request for the same date and time already exists and is not refused',
            })
          } else {
            const roleId = data.role?.roleId || 0
            const exceptionRequestData = {
              employeeId: data.employeeId,
              exceptionTypeId: data.exceptionTypeId,
              exceptionRequestStatus: data.exceptionRequestStatus,
              exceptionRequestDescription: data.exceptionRequestDescription,
              exceptionRequestCheckInTime: data.exceptionRequestCheckInTime,
              exceptionRequestCheckOutTime: data.exceptionRequestCheckOutTime,
              requestedDate: currentDate,
              exceptionRequestRhRead: roleId === 2 ? 1 : 0,
              exceptionRequestGerencialRead: roleId !== 2 ? 1 : 0,
              userId: user.userId,
            }
            delete data.role
            const exceptionRequest = await ExceptionRequest.create(exceptionRequestData)
            exceptionRequestsSaved.push(exceptionRequest)
          }
        } catch (error) {
          exceptionRequestsError.push({
            requestedDate: currentDate,
            error: error.message,
          })
        }
      }
    }

    if (exceptionRequestsSaved.length > 0) {
      if (Ws.io) {
        Ws.io.emit('new-exception-request', {})
      }
    }
    const dataInfo = {
      data: {
        exceptionRequestsSaved: exceptionRequestsSaved,
        exceptionRequestsError: exceptionRequestsError,
      },
    }
    return response
      .status(201)
      .json(formatResponse('success', 'Successfully created', 'Resource created', dataInfo))
  }

  /**
   * @swagger
   * /api/exception-requests/{id}:
   *   get:
   *     summary: Get a specific exception request by ID
   *     tags: [ExceptionRequests]
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: ID of the exception request
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Exception request found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     employeeId:
   *                       type: integer
   *                     exceptionTypeId:
   *                       type: integer
   *                     exceptionRequestStatus:
   *                       type: string
   *                     exceptionRequestDescription:
   *                       type: string
   *       404:
   *         description: Exception request not found
   */
  async show({ params, response }: HttpContext) {
    try {
      const exceptionRequest = await ExceptionRequest.findOrFail(params.id)
      return response
        .status(200)
        .json(
          formatResponse(
            'success',
            'Successfully fetched',
            'Resource fetched',
            exceptionRequest.toJSON()
          )
        )
    } catch {
      return response
        .status(404)
        .json(formatResponse('error', 'Not Found', 'Resource not found', 'NO DATA'))
    }
  }

  /**
   * @swagger
   * /api/exception-requests/{id}:
   *   put:
   *     summary: Update an existing exception request
   *     tags: [ExceptionRequests]
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: ID of the exception request
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               exceptionRequestStatus:
   *                 type: string
   *                 enum: [requested, pending, accepted, refused]
   *               exceptionRequestDescription:
   *                 type: string
   *                 maxLength: 255
   *               requestedDate:
   *                 type: string
   *                 example: "2024-11-15 14:00:00"
   *     responses:
   *       200:
   *         description: Exception request updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     employeeId:
   *                       type: integer
   *                     exceptionTypeId:
   *                       type: integer
   *                     exceptionRequestStatus:
   *                       type: string
   *                     exceptionRequestDescription:
   *                       type: string
   *       404:
   *         description: Exception request not found
   */

  async update({ params, request, response }: HttpContext) {
    const data = await request.validateUsing(updateExceptionRequestValidator)
    const exceptionRequest = await ExceptionRequest.findOrFail(params.id)
    const roleId = data.role?.roleId || 0
    const requestedDate = data.requestedDate.toISODate()
    if (requestedDate) {
      const exceptionRequestData = {
        exceptionRequestStatus: data.exceptionRequestStatus,
        exceptionRequestDescription: data.exceptionRequestDescription,
        exceptionRequestCheckInTime: data.exceptionRequestCheckInTime,
        exceptionRequestCheckOutTime: data.exceptionRequestCheckOutTime,
        requestedDate: requestedDate,
        exceptionRequestRhRead: roleId === 2 ? 1 : 0,
        exceptionRequestGerencialRead: roleId !== 2 ? 1 : 0,
      }
      delete data.role
      exceptionRequest.merge(exceptionRequestData)
      await exceptionRequest.save()
      return response
        .status(200)
        .json(
          formatResponse(
            'success',
            'Successfully updated',
            'Resource updated',
            exceptionRequest.toJSON()
          )
        )
    } else {
      return response.status(404).json({
        error: 'Exception request date is not valid',
      })
    }
  }
  /**
   * @swagger
   * /api/exception-requests/{id}:
   *   delete:
   *     summary: Delete an exception request by ID
   *     tags: [ExceptionRequests]
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: ID of the exception request
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Exception request deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 message:
   *                   type: string
   *                   example: Successfully deleted
   *                 data:
   *                   type: string
   *                   example: DELETED
   *       404:
   *         description: Exception request not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: error
   *                 message:
   *                   type: string
   *                   example: Exception request not found
   */

  async destroy({ params, response }: HttpContext) {
    const exceptionRequest = await ExceptionRequest.findOrFail(params.id)
    await exceptionRequest.delete()

    return response
      .status(200)
      .json(formatResponse('success', 'Successfully deleted', 'Resource deleted', 'DELETED'))
  }

  /**
   * @swagger
   * /api/exception-requests/all:
   *   get:
   *     summary: Retrieve all exception requests with filters and pagination
   *     tags: [ExceptionRequests]
   *     parameters:
   *       - name: page
   *         in: query
   *         description: Page number for pagination
   *         required: false
   *         schema:
   *           type: integer
   *           default: 1
   *       - name: limit
   *         in: query
   *         description: Number of items per page
   *         required: false
   *         schema:
   *           type: integer
   *           default: 10
   *       - name: departmentId
   *         in: query
   *         description: Filter by department ID
   *         required: false
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         description: Filter by position ID
   *         required: false
   *         schema:
   *           type: integer
   *       - name: status
   *         in: query
   *         description: Filter by exception request status
   *         required: false
   *         schema:
   *           type: string
   *           enum: [requested, pending, accepted, refused]
   *       - name: searchText
   *         in: query
   *         description: Filter by employee first or last name
   *         required: false
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: List of exception requests retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 message:
   *                   type: string
   *                   example: Successfully fetched all exception requests
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: integer
   *                       employeeId:
   *                         type: integer
   *                       exceptionRequestStatus:
   *                         type: string
   *                       exceptionRequestDescription:
   *                         type: string
   *                       requestedDate:
   *                         type: string
   *                         example: "2024-11-15 14:00:00"
   *                 metadata:
   *                   type: object
   *                   properties:
   *                     total:
   *                       type: integer
   *                     per_page:
   *                       type: integer
   *                     current_page:
   *                       type: integer
   *                     last_page:
   *                       type: integer
   *                     first_page:
   *                       type: integer
   *       404:
   *         description: No exception requests found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: error
   *                 message:
   *                   type: string
   *                   example: No exception requests found
   */

  async indexAllExceptionRequests({ auth, request, response }: HttpContext) {
    await auth.check()
    const user = auth.user
    let userResponsibleId = null
    if (user) {
      await user.preload('role')
      if (user.role.roleSlug !== 'root') {
        userResponsibleId = user?.userId
      }
    }
    const page = request.input('page', 1)
    const limit = request.input('limit', 10)
    let departmentId = request.input('departmentId')
    let positionId = request.input('positionId')
    let status = request.input('status')
    let employeeName = request.input('employeeName')
    if (departmentId === '9999') {
      departmentId = null
    }
    if (positionId === '9999') {
      positionId = null
    }
    if (status === 'all') {
      status = null
    }
    // Construir la consulta base
    const query = ExceptionRequest.query()
      .preload('employee', (employeeQuery) => {
        employeeQuery.preload('department')
        employeeQuery.preload('position')
      })
      .preload('exceptionType')
      .preload('user')
      .if(departmentId, (q) => {
        q.whereHas('employee', (employeeQuery) => {
          employeeQuery.where('departmentId', departmentId)
        })
      })
      .if(positionId, (q) => {
        q.whereHas('employee', (employeeQuery) => {
          employeeQuery.where('positionId', positionId)
        })
      })
      .if(status, (q) => q.where('exceptionRequestStatus', status))
      .if(employeeName, (q) => {
        q.whereHas('employee', (employeeQuery) => {
          employeeQuery.where('employeeId', employeeName)
        })
      })
      .whereHas('employee', (employeeQuery) => {
        employeeQuery.if(userResponsibleId &&
          typeof userResponsibleId && userResponsibleId > 0,
          (queryUserResponsible) => {
            queryUserResponsible.whereHas('userResponsibleEmployee', (userResponsibleEmployeeQuery) => {
              userResponsibleEmployeeQuery.where('userId', userResponsibleId!)
            })
          }
        )
      }).orderByRaw(`CASE
                 WHEN exception_request_status = 'pending' THEN 1
                 WHEN exception_request_status = 'requested' THEN 2
                 WHEN exception_request_status = 'accepted' THEN 3
                 WHEN exception_request_status = 'refused' THEN 4
                 ELSE 5
               END`)
    const exceptionRequests = await query.paginate(page, limit)

    return response.status(200).json(
      formatResponse(
        'success',
        'Successfully fetched all exception requests',
        'Resources fetched',
        exceptionRequests.all(),
        {
          total: exceptionRequests.total,
          per_page: exceptionRequests.perPage,
          current_page: exceptionRequests.currentPage,
          last_page: exceptionRequests.lastPage,
          first_page: 1,
        }
      )
    )
  }
  /**
   * @swagger
   * /api/exception-requests/unread:
   *   get:
   *     summary: Get unread exception requests
   *     description: Fetch unread exception requests filtered by RH and managerial read status.
   *     tags:
   *       - ExceptionRequests
   *     parameters:
   *       - name: rhRead
   *         in: query
   *         required: false
   *         description: >
   *           Filter by RH read status (0: unread, 1: read).
   *         schema:
   *           type: integer
   *           enum: [0, 1]
   *       - name: gerencialRead
   *         in: query
   *         required: false
   *         description: >
   *           Filter by managerial read status (0: unread, 1: read).
   *         schema:
   *           type: integer
   *           enum: [0, 1]
   *     responses:
   *       200:
   *         description: Successfully fetched unread exception requests
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 message:
   *                   type: string
   *                   example: Successfully fetched unread exception requests
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       exceptionRequestId:
   *                         type: integer
   *                         example: 1
   *                       employeeId:
   *                         type: integer
   *                         example: 123
   *                       exceptionTypeId:
   *                         type: integer
   *                         example: 5
   *                       exceptionRequestStatus:
   *                         type: string
   *                         example: pending
   *       400:
   *         description: Invalid query parameters
   *       500:
   *         description: Internal server error
   */

  async getUnreadExceptionRequests({ request, response }: HttpContext) {
    const rhReadFilter = request.input('rhRead')
    const gerencialReadFilter = request.input('gerencialRead')

    const query = ExceptionRequest.query()
      .if(rhReadFilter !== undefined, (q) => {
        q.where('exceptionRequestRhRead', rhReadFilter)
      })
      .if(gerencialReadFilter !== undefined, (q) => {
        q.where('exceptionRequestGerencialRead', gerencialReadFilter)
      })
      .if(rhReadFilter === undefined && gerencialReadFilter === undefined, (q) => {
        q.where('exceptionRequestRhRead', 0).where('exceptionRequestGerencialRead', 0)
      })

    const exceptionRequests = await query.exec()

    return response
      .status(200)
      .json(
        formatResponse(
          'success',
          'Successfully fetched unread exception requests',
          'Resources fetched',
          exceptionRequests
        )
      )
  }
}
