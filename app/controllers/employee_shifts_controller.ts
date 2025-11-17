import { HttpContext } from '@adonisjs/core/http'
import EmployeeShift from '../models/employee_shift.js'
import {
  createEmployeeShiftValidator,
  updateEmployeeShiftValidator,
} from '../validators/employee_shift.js'
import { DateTime } from 'luxon'
import EmployeeShiftService from '#services/employee_shift_service'
import { EmployeeShiftFilterInterface } from '../interfaces/employee_shift_filter_interface.js'

export default class EmployeeShiftController {
  /**
   * @swagger
   * /api/employee_shifts:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - EmployeeShift
   *     summary: create new assign shift to employee
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               shiftId:
   *                 type: number
   *                 description: Shift id
   *                 required: true
   *                 default: ''
   *               employeeId:
   *                 type: number
   *                 description: Employee id
   *                 required: true
   *                 default: ''
   *               employeShiftsApplySince:
   *                 type: string
   *                 format: date
   *                 description: Apply since (YYYY-MM-DD)
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
  async store({ auth, request, response, i18n }: HttpContext) {
    try {
      await request.validateUsing(createEmployeeShiftValidator)

      const employeeId = request.input('employeeId')
      const shiftId = request.input('shiftId')
      const employeShiftsApplySince = request.input('employeShiftsApplySince')
      const employeeShiftService = new EmployeeShiftService(i18n)

      if (!employeeShiftService.isValidDate(employeShiftsApplySince)) {
        return response.status(400).json({
          type: 'error',
          title: 'Validation error',
          message: 'Date is invalid',
          data: null,
        })
      }

      const employeeShift = {
        employeeId: employeeId,
        shiftId: Number.parseInt(shiftId),
        employeShiftsApplySince: employeeShiftService.getDateAndTime(employeShiftsApplySince),
      } as EmployeeShift

      const verifyInfo = await employeeShiftService.verifyInfo(employeeShift)

      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...employeeShift },
        }
      }
      await employeeShiftService.deleteEmployeeShifts(employeeShift)
      // const existingShifts = await EmployeeShift.query()
      //   .where('employeeId', employeeId)
      //   .whereNull('employeShiftsDeletedAt')

      // if (existingShifts.length > 0) {
      //   await EmployeeShift.query()
      //     .where('employeeId', employeeId)
      //     .whereNull('employeShiftsDeletedAt')
      //     .update({ employeShiftsDeletedAt: new Date() })
      // }

      const newEmployeeShift = await EmployeeShift.create(employeeShift)

      const employeeShiftDate = employeeShift.employeShiftsApplySince
      const date = typeof employeeShiftDate === 'string' ? new Date(employeeShiftDate) : employeeShiftDate
      await employeeShiftService.updateAssistCalendar(employeeShift.employeeId, date)

      const rawHeaders = request.request.rawHeaders
      const userId = auth.user?.userId
      if (userId) {
        const logEmployeeShift = await employeeShiftService.createActionLog(rawHeaders, 'store')
        logEmployeeShift.user_id = userId
        logEmployeeShift.record_current = JSON.parse(JSON.stringify(newEmployeeShift))
        await employeeShiftService.saveActionOnLog(logEmployeeShift)
      }

      return response.status(201).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resource created',
        data: newEmployeeShift.toJSON(),
      })
    } catch (error) {
      if (error.messages) {
        return response.status(400).json({
          type: 'error',
          title: 'Validation error',
          message: error.messages,
          data: error,
        })
      }
      return response.status(500).json({
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error occurred',
        data: error.message,
      })
    }
  }

  /**
   * @swagger
   * /api/employee_shifts:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - EmployeeShift
   *     summary: get all assign shift to employee
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

  async index({ response }: HttpContext) {
    try {
      const employeeShifts = await EmployeeShift.query().whereNull('deletedAt')
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resources fetched',
        data: employeeShifts,
      })
    } catch (error) {
      return response.status(500).json({
        type: 'error',
        title: 'Server error',
        message: error.message,
        data: null,
      })
    }
  }

  /**
   * @swagger
   * /api/employee_shifts/{employeeShiftId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - EmployeeShift
   *     summary: get assign shift to employee by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeShiftId
   *         schema:
   *           type: number
   *         description: Employee shift id
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

  async show({ params, response }: HttpContext) {
    try {
      const employeeShift = await EmployeeShift.findOrFail(params.id)
      await employeeShift.load('shift')
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resource fetched',
        data: employeeShift,
      })
    } catch (error) {
      return response.status(404).json({
        type: 'error',
        title: 'Not found',
        message: 'Resource not found',
        data: error,
      })
    }
  }

  /**
   * @swagger
   * /api/employee_shifts/{employeeShiftId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - EmployeeShift
   *     summary: update assign shift to employee
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeShiftId
   *         schema:
   *           type: number
   *         description: Employee shift id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeShiftsApplySince:
   *                 type: string
   *                 format: date
   *                 description: Apply since (YYYY-MM-DD)
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

  async update({ auth, params, request, response, i18n }: HttpContext) {
    try {
      await request.validateUsing(updateEmployeeShiftValidator)
      const updateEmployeeShift = await EmployeeShift.findOrFail(params.id)
      const employeeShiftId = params.id
      const employeShiftsApplySince = request.input('employeShiftsApplySince')
      const employeeShiftService = new EmployeeShiftService(i18n)
      if (!employeeShiftService.isValidDate(employeShiftsApplySince)) {
        return response.status(400).json({
          type: 'error',
          title: 'Validation error',
          message: 'Date is invalid',
          data: null,
        })
      }
      const employeeShift = {
        employeeShiftId: employeeShiftId,
        shiftId: updateEmployeeShift.shiftId,
        employeeId: updateEmployeeShift.employeeId,
        employeShiftsApplySince: employeeShiftService.getDateAndTime(employeShiftsApplySince),
      } as EmployeeShift
      if (!employeeShiftService.isValidDate(employeShiftsApplySince)) {
        return response.status(400).json({
          type: 'error',
          title: 'Validation error',
          message: 'Date is invalid',
          data: null,
        })
      }
      const verifyInfo = await employeeShiftService.verifyInfo(employeeShift)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...employeeShift },
        }
      }
      const previousEmployeeShift = JSON.parse(JSON.stringify(updateEmployeeShift))
      updateEmployeeShift.merge(employeeShift)
      await updateEmployeeShift.save()

      const employeeShiftDate = employeeShift.employeShiftsApplySince
      const date = typeof employeeShiftDate === 'string' ? new Date(employeeShiftDate) : employeeShiftDate
      await employeeShiftService.updateAssistCalendar(employeeShift.employeeId, date)

      const rawHeaders = request.request.rawHeaders
      const userId = auth.user?.userId
      if (userId) {
        const logEmployeeShift = await employeeShiftService.createActionLog(rawHeaders, 'update')
        logEmployeeShift.user_id = userId
        logEmployeeShift.record_current = JSON.parse(JSON.stringify(updateEmployeeShift))
        logEmployeeShift.record_previous = previousEmployeeShift
        await employeeShiftService.saveActionOnLog(logEmployeeShift)
      }
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resource updated',
        data: updateEmployeeShift.toJSON(),
      })
    } catch (error) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.status(404).json({
          type: 'error',
          title: 'Not found',
          message: 'Resource not found',
          data: null,
        })
      }
      return response.status(400).json({
        type: 'error',
        title: 'Validation error',
        message: error.messages || error.message,
        data: null,
      })
    }
  }

  /**
   * @swagger
   * /api/employee_shifts/{employeeShiftId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - EmployeeShift
   *     summary: delete assign shift to employee
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeShiftId
   *         schema:
   *           type: number
   *         description: Employe Shift Id
   *         required: true
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

  async destroy({ auth, request, params, response, i18n }: HttpContext) {
    try {
      const employeeShift = await EmployeeShift.findOrFail(params.id)
      employeeShift.deletedAt = DateTime.now()
      await employeeShift.save()
      const employeeShiftService = new EmployeeShiftService(i18n)

      const employeeShiftDate = employeeShift.employeShiftsApplySince
      const date = typeof employeeShiftDate === 'string' ? new Date(employeeShiftDate) : employeeShiftDate
      await employeeShiftService.updateAssistCalendar(employeeShift.employeeId, date)

      const rawHeaders = request.request.rawHeaders
      const userId = auth.user?.userId
      if (userId) {
        const logEmployeeShift = await employeeShiftService.createActionLog(rawHeaders, 'delete')
        logEmployeeShift.user_id = userId
        logEmployeeShift.record_current = JSON.parse(JSON.stringify(employeeShift))
        await employeeShiftService.saveActionOnLog(logEmployeeShift)
      }
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resource deleted',
        data: employeeShift.toJSON(),
      })
    } catch (error) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.status(404).json({
          type: 'error',
          title: 'Not found',
          message: 'Resource not found',
          data: null,
        })
      }
      return response.status(500).json({
        type: 'error',
        title: 'Server error',
        message: 'An error occurred while deleting the resource',
        data: null,
      })
    }
  }

  /**
   * @swagger
   * /api/employee-shifts-employee/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - EmployeeShift
   *     summary: get shifts by employee
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *       - name: shiftId
   *         in: query
   *         required: false
   *         description: Shift id
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
      const shiftId = request.input('shiftId')
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
        shiftId: shiftId,
        dateStart: dateStart,
        dateEnd: dateEnd,
      } as EmployeeShiftFilterInterface
      const employeeShiftService = new EmployeeShiftService(i18n)
      const employeeShifts = await employeeShiftService.getByEmployee(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Employee shifts',
        message: 'The employee shift were found successfully',
        data: {
          employeeShifts: employeeShifts,
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
   * /api/employee-shifts-active-shift-employee/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - EmployeeShift
   *     summary: get shift active by employee
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
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
  async getShiftActiveByEmployee({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }
      const employeeShiftService = new EmployeeShiftService(i18n)
      const employeeShift = await employeeShiftService.getShiftActiveByEmployee(employeeId)
      response.status(200)
      return {
        type: 'success',
        title: 'Employee shift active',
        message: 'The employee shift active was found successfully',
        data: {
          employeeShift: employeeShift,
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
