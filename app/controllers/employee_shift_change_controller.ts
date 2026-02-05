import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import { DateTime } from 'luxon'
import EmployeeShiftChangeService from '#services/employee_shift_change_service'
import { createEmployeeShiftChangeValidator } from '#validators/employee_shift_change'
import EmployeeShiftChange from '#models/employee_shift_changes'
import { EmployeeShiftChangeFilterInterface } from '../interfaces/employee_shift_change_filter_interface.js'
export default class EmployeeShiftChangeController {
  /**
   * @swagger
   * /api/employee-shift-changes/:
   *   post:
   *     summary: create new employee shift change
   *     tags:
   *       - Employee Shift Changes
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               employeeIdFrom:
   *                 type: number
   *                 description: Employee id from
   *                 required: true
   *                 default: ''
   *               shiftIdFrom:
   *                 type: number
   *                 description: Shift id from
   *                 required: true
   *                 default: ''
   *               employeeShiftChangeDateFrom:
   *                 type: string
   *                 format: date
   *                 description: Employee shift change date from (YYYY-MM-DD)
   *                 required: true
   *                 default: ''
   *               employeeShiftChangeDateFromIsRestDay:
   *                 type: boolean
   *                 description: Employee shift change date from is rest
   *                 required: true
   *                 default: false
   *               employeeIdTo:
   *                 type: number
   *                 description: Employee id to
   *                 required: true
   *                 default: ''
   *               shiftIdTo:
   *                 type: number
   *                 description: Shift id to
   *                 required: true
   *                 default: ''
   *               employeeShiftChangeDateTo:
   *                 type: string
   *                 format: date
   *                 description: Employee shift change date to (YYYY-MM-DD)
   *                 required: true
   *                 default: ''
   *               employeeShiftChangeDateToIsRestDay:
   *                 type: boolean
   *                 description: Employee shift change date to is rest
   *                 required: true
   *                 default: false
   *               employeeShiftChangeChangeThisShift:
   *                 type: boolean
   *                 description: Employee shift change change this shift
   *                 required: true
   *                 default: false
   *               employeeShiftChangeNote:
   *                 type: string
   *                 description: Employee shift change note
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
  @inject()
  async store({ auth, request, response }: HttpContext) {
    try {
      const employeeShiftChangeService = new EmployeeShiftChangeService()
      await request.validateUsing(createEmployeeShiftChangeValidator)
      const employeeIdFrom = request.input('employeeIdFrom')
      const shiftIdFrom = request.input('shiftIdFrom')
     
      let employeeShiftChangeDateFrom = request.input('employeeShiftChangeDateFrom')
      employeeShiftChangeDateFrom = employeeShiftChangeDateFrom
        ? DateTime.fromJSDate(new Date(employeeShiftChangeDateFrom)).setZone('UTC').toJSDate()
        : null
      let employeeShiftChangeDateFromIsRestDay = request.input(
        'employeeShiftChangeDateFromIsRestDay'
      )
      if (
        employeeShiftChangeDateFromIsRestDay &&
        (employeeShiftChangeDateFromIsRestDay ||
          employeeShiftChangeDateFromIsRestDay === '1' ||
          employeeShiftChangeDateFromIsRestDay === 1)
      ) {
        employeeShiftChangeDateFromIsRestDay = 1
      } else {
        employeeShiftChangeDateFromIsRestDay = 0
      }
      const employeeShiftChangeChangeThisShift = request.input('employeeShiftChangeChangeThisShift')
      const employeeIdTo = request.input('employeeIdTo')
      const shiftIdTo = request.input('shiftIdTo')
      let employeeShiftChangeDateTo = request.input('employeeShiftChangeDateTo')
      employeeShiftChangeDateTo = employeeShiftChangeDateTo
        ? DateTime.fromJSDate(new Date(employeeShiftChangeDateTo)).setZone('UTC').toJSDate()
        : null
      let employeeShiftChangeDateToIsRestDay = request.input('employeeShiftChangeDateToIsRestDay')
      if (
        employeeShiftChangeDateToIsRestDay &&
        (employeeShiftChangeDateToIsRestDay === 'true' ||
          employeeShiftChangeDateToIsRestDay === '1' ||
          employeeShiftChangeDateToIsRestDay === 1)
      ) {
        employeeShiftChangeDateToIsRestDay = 1
      } else {
        employeeShiftChangeDateToIsRestDay = 0
      }
      const employeeShiftChangeNote = request.input('employeeShiftChangeNote')
      const employeeShiftChange = {
        employeeIdFrom: employeeIdFrom,
        shiftIdFrom: shiftIdFrom,
        employeeShiftChangeDateFrom: employeeShiftChangeDateFrom,
        employeeShiftChangeDateFromIsRestDay: employeeShiftChangeDateFromIsRestDay,
        employeeIdTo: employeeIdTo,
        shiftIdTo: shiftIdTo,
        employeeShiftChangeDateTo: employeeShiftChangeDateTo,
        employeeShiftChangeDateToIsRestDay: employeeShiftChangeDateToIsRestDay,
        employeeShiftChangeChangeThisShift: employeeShiftChangeChangeThisShift,
        employeeShiftChangeNote: employeeShiftChangeNote,
      } as EmployeeShiftChange
      const employeeShiftChangeSecond = {
        employeeIdFrom: employeeIdTo,
        shiftIdFrom: shiftIdTo,
        employeeShiftChangeDateFrom: employeeShiftChangeDateTo,
        employeeShiftChangeDateFromIsRestDay: employeeShiftChangeDateToIsRestDay,
        employeeIdTo: employeeIdFrom,
        shiftIdTo: shiftIdFrom,
        employeeShiftChangeDateTo: employeeShiftChangeDateFrom,
        employeeShiftChangeDateToIsRestDay: employeeShiftChangeDateFromIsRestDay,
        employeeShiftChangeChangeThisShift: employeeShiftChangeChangeThisShift,
        employeeShiftChangeNote: employeeShiftChangeNote,
      } as EmployeeShiftChange
      let verifyExist = await employeeShiftChangeService.verifyInfoExist(employeeShiftChange)
      if (verifyExist.status !== 200) {
        response.status(verifyExist.status)
        return {
          type: verifyExist.type,
          title: verifyExist.title,
          message: verifyExist.message,
          data: { ...employeeShiftChange },
        }
      }
      let verifyInfo = await employeeShiftChangeService.verifyInfo(employeeShiftChange)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...employeeShiftChange },
        }
      }
      verifyExist = await employeeShiftChangeService.verifyInfoExist(employeeShiftChangeSecond)
      if (verifyExist.status !== 200) {
        response.status(verifyExist.status)
        return {
          type: verifyExist.type,
          title: verifyExist.title,
          message: verifyExist.message,
          data: { ...employeeShiftChange },
        }
      }
      verifyInfo = await employeeShiftChangeService.verifyInfo(employeeShiftChangeSecond)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...employeeShiftChange },
        }
      }

      const newEmployeeShiftChange = await employeeShiftChangeService.create(employeeShiftChange)
    
      const rawHeaders = request.request.rawHeaders
      const userId = auth.user?.userId
      if (userId) {
        const logEmployeeShiftChange = await employeeShiftChangeService.createActionLog(
          rawHeaders,
          'store'
        )
        logEmployeeShiftChange.user_id = userId
        logEmployeeShiftChange.record_current = JSON.parse(JSON.stringify(newEmployeeShiftChange))
        await employeeShiftChangeService.saveActionOnLog(
          logEmployeeShiftChange,
          'log_employee_shift_changes'
        )
      }
      if (!employeeShiftChangeChangeThisShift) {
        const secondEmployeeShiftChange =
        await employeeShiftChangeService.create(employeeShiftChangeSecond)
      if (userId) {
        const logEmployeeShiftChange = await employeeShiftChangeService.createActionLog(
          rawHeaders,
          'store'
        )
        logEmployeeShiftChange.user_id = userId
        logEmployeeShiftChange.record_current = JSON.parse(
          JSON.stringify(secondEmployeeShiftChange)
        )
        await employeeShiftChangeService.saveActionOnLog(
          logEmployeeShiftChange,
          'log_employee_shift_changes'
        )
      }
      }
     

      response.status(201)
      return {
        type: 'success',
        title: 'Employee shift changes',
        message: 'The employee shift change was created successfully',
        data: { employeeShiftChange: newEmployeeShiftChange },
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
   * /api/employee-shift-changes/{employeeShiftChangeId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Shift Changes
   *     summary: delete employee shift change
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeShiftChangeId
   *         schema:
   *           type: number
   *         description: Employee shift change id
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
  async delete({ auth, request, response }: HttpContext) {
    try {
      const employeeShiftChangeId = request.param('employeeShiftChangeId')
      if (!employeeShiftChangeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee shift change Id was not found',
          data: { employeeShiftChangeId },
        }
      }
      const currentEmployeeShiftChange = await EmployeeShiftChange.query()
        .whereNull('employee_shift_change_deleted_at')
        .where('employee_shift_change_id', employeeShiftChangeId)
        .first()
      if (!currentEmployeeShiftChange) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee shift change was not found',
          message: 'The employee shift change was not found with the entered ID',
          data: { employeeShiftChangeId },
        }
      }
      const employeeShiftChangeService = new EmployeeShiftChangeService()
      const deleteEmployeeShiftChange = await employeeShiftChangeService.delete(
        currentEmployeeShiftChange
      )
      const userId = auth.user?.userId
      if (userId) {
        const rawHeaders = request.request.rawHeaders
        const logEmployeeShiftChange = await employeeShiftChangeService.createActionLog(
          rawHeaders,
          'delete'
        )
        logEmployeeShiftChange.user_id = userId
        logEmployeeShiftChange.record_current = JSON.parse(
          JSON.stringify(deleteEmployeeShiftChange)
        )
        await employeeShiftChangeService.saveActionOnLog(
          logEmployeeShiftChange,
          'log_employee_shift_changes'
        )
      }
      const secondEmployeeShiftChange = await EmployeeShiftChange.query()
        .whereNull('employee_shift_change_deleted_at')
        .where('employee_id_from', currentEmployeeShiftChange.employeeIdTo)
        .where(
          'employee_shift_change_date_from',
          currentEmployeeShiftChange.employeeShiftChangeDateTo
        )
        .first()
      if (secondEmployeeShiftChange) {
        const deleteSecondEmployeeShiftChange =
          await employeeShiftChangeService.delete(secondEmployeeShiftChange)
        if (userId) {
          const rawHeaders = request.request.rawHeaders
          const logEmployeeShiftChange = await employeeShiftChangeService.createActionLog(
            rawHeaders,
            'delete'
          )
          logEmployeeShiftChange.user_id = userId
          logEmployeeShiftChange.record_current = JSON.parse(
            JSON.stringify(deleteSecondEmployeeShiftChange)
          )
          await employeeShiftChangeService.saveActionOnLog(
            logEmployeeShiftChange,
            'log_employee_shift_changes'
          )
        }
      }
      if (deleteEmployeeShiftChange) {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee shift changes',
          message: 'The employee shift change was deleted successfully',
          data: { employeeShiftChange: deleteEmployeeShiftChange },
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
   * /api/employee-shift-changes/{employeeShiftChangeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Shift Changes
   *     summary: get employee shift change by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeShiftChangeId
   *         schema:
   *           type: number
   *         description: Employee shift change id
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
      const employeeShiftChangeId = request.param('employeeShiftChangeId')
      if (!employeeShiftChangeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee shift change Id was not found',
          data: { employeeShiftChangeId },
        }
      }
      const employeeShiftChangeService = new EmployeeShiftChangeService()
      const showEmployeeShiftChange = await employeeShiftChangeService.show(employeeShiftChangeId)
      if (!showEmployeeShiftChange) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee shift change was not found',
          message: 'The employee shift change was not found with the entered ID',
          data: { employeeShiftChangeId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee shift change',
          message: 'The employee shift change was found successfully',
          data: { employeeShiftChange: showEmployeeShiftChange },
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
   * /api/employee-shift-changes-by-employee/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Shift Changes
   *     summary: get shifts changes by employee
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *       - name: date
   *         in: query
   *         required: false
   *         description: Date (YYYY-MM-DD)
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
  async getByEmployee({ request, response }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      const date = request.input('date')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee Id was not found',
          data: { employeeId },
        }
      }
      const filters = {
        employeeId: employeeId,
        date: date,
      } as EmployeeShiftChangeFilterInterface
      const employeeShiftChangeService = new EmployeeShiftChangeService()
      const employeeShiftChanges = await employeeShiftChangeService.getByEmployee(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Shift changes',
        message: 'The shift changes were found successfully',
        data: {
          employeeShiftChanges: employeeShiftChanges,
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
