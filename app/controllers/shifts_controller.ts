import { HttpContext } from '@adonisjs/core/http'
import Shift from '../models/shift.js'
import { createShiftValidator, updateShiftValidator } from '../validators/shift.js'
import { DateTime } from 'luxon'
import env from '#start/env'
import ShiftService from '#services/shift_service'
/**
 * @swagger
 * /api/shift:
 *   post:
 *     tags:
 *       - Shifts
 *     summary: Create a new shift
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               shiftName:
 *                 type: string
 *               shiftDayStart:
 *                 type: number
 *               shiftTimeStart:
 *                 type: string
 *               shiftActiveHours:
 *                 type: number
 *               shiftActiveMinutes:
 *                 type: number
 *               shiftRestDays:
 *                 type: string
 *               shiftAccumulatedFault:
 *                 type: number
 *               shiftTemp:
 *                 type: number
 *     responses:
 *       '201':
 *         description: Shift created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: number
 *                 shiftName:
 *                   type: string
 *                 shiftDayStart:
 *                   type: number
 *                 shiftTimeStart:
 *                   type: string
 *                 shiftActiveHours:
 *                   type: number
 *                 shiftActiveMinutes:
 *                   type: number
 *                 shiftRestDays:
 *                   type: string
 *                 shiftAccumulatedFault:
 *                   type: number
 *       '400':
 *         description: Invalid input, validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
export default class ShiftController {
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createShiftValidator)
      const shiftService = new ShiftService()
      const businessConf = `${env.get('SYSTEM_BUSINESS')}`
      const shift = {
        shiftName: data.shiftName,
        shiftTimeStart: data.shiftTimeStart,
        shiftActiveHours: data.shiftActiveHours,
        shiftActiveMinutes: data.shiftActiveMinutes || 0,
        shiftRestDays: data.shiftRestDays,
        shiftAccumulatedFault: data.shiftAccumulatedFault,
        shiftCalculateFlag: request.input('shiftCalculateFlag'),
        shiftBusinessUnits: businessConf,
        shiftTemp: data.shiftTemp,
      } as Shift
      const verifyInfo = await shiftService.verifyInfo(shift)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const newShift = await shiftService.create(shift)
      return response.status(201).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resource created',
        data: newShift.toJSON(),
      })
    } catch (error) {
      return response.status(400).json({
        type: 'error',
        title: 'Validation error',
        message: 'Invalid input, validation error 400',
        data: error,
      })
    }
  }

  /**
   * @swagger
   * /api/shift:
   *   get:
   *     tags:
   *       - Shifts
   *     summary: Get all shifts with optional filters
   *     parameters:
   *       - in: query
   *         name: shiftDayStart
   *         schema:
   *           type: number
   *         description: Filter by shift day start
   *       - in: query
   *         name: shiftName
   *         schema:
   *           type: string
   *         description: Filter by shift name
   *       - in: query
   *         name: shiftActiveHours
   *         schema:
   *           type: number
   *         description: Filter by shift active hours
   *     responses:
   *       '200':
   *         description: A list of shifts
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   id:
   *                     type: number
   *                   shiftName:
   *                     type: string
   *                   shiftDayStart:
   *                     type: number
 *                   shiftTimeStart:
 *                     type: string
 *                   shiftActiveHours:
 *                     type: number
 *                   shiftActiveMinutes:
 *                     type: number
 *                   shiftRestDays:
 *                     type: string
   */
  async index({ request, response }: HttpContext) {
    try {
      const businessConf = `${env.get('SYSTEM_BUSINESS')}`
      const businessList = businessConf.split(',')
      const { shiftDayStart, shiftName, shiftActiveHours, page = 1, limit = 10 } = request.qs()

      const shiftQuery = Shift.query()
        .whereNull('shiftDeletedAt')
        .where('shift_temp', 0)
        .andWhere((query) => {
          query.whereNotNull('shift_business_units')
          query.andWhere((subQuery) => {
            businessList.forEach((business) => {
              subQuery.orWhereRaw('FIND_IN_SET(?, shift_business_units)', [business.trim()])
            })
          })
        })
      if (shiftDayStart) {
        shiftQuery.where('shiftDayStart', shiftDayStart)
      }

      if (shiftName) {
        shiftQuery.where('shiftName', 'LIKE', `%${shiftName}%`)
      }

      if (shiftActiveHours) {
        shiftQuery.where('shiftActiveHours', shiftActiveHours)
      }

      const shifts = await shiftQuery.orderBy('shiftName', 'asc').paginate(page, limit)
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resources fetched',
        data: {
          meta: {
            total: shifts.total,
            per_page: shifts.perPage,
            current_page: shifts.currentPage,
            last_page: shifts.lastPage,
            first_page: 1,
          },
          data: shifts.all().map((shift) => shift.toJSON()),
        },
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
   * /api/shift/{id}:
   *   get:
   *     tags:
   *       - Shifts
   *     summary: Get a shift by ID
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: number
   *     responses:
   *       '200':
   *         description: Shift retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: number
   *                 shiftName:
   *                   type: string
   *                 shiftDayStart:
   *                   type: number
   *                 shiftTimeStart:
   *                   type: string
   *                 shiftActiveHours:
   *                   type: number
   *                 shiftRestDays:
   *                   type: string
   *                 shiftTemp:
   *                   type: number
   *       '404':
   *         description: Shift not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   */
  async show({ params, response }: HttpContext) {
    try {
      const shift = await Shift.query()
        .where('shiftId', params.id)
        .whereNull('shiftDeletedAt')
        .firstOrFail()
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resource fetched',
        data: shift.toJSON(),
      })
    } catch (error) {
      return response.status(404).json({
        type: 'error',
        title: 'Not found',
        message: 'Shift not found',
        data: null,
      })
    }
  }

  /**
   * @swagger
   * /api/shift/{id}:
   *   put:
   *     tags:
   *       - Shifts
   *     summary: Update a shift by ID
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: number
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               shiftName:
   *                 type: string
   *               shiftDayStart:
   *                 type: number
   *               shiftTimeStart:
   *                 type: string
   *               shiftActiveHours:
   *                 type: number
   *               shiftRestDays:
   *                 type: string
   *               shiftAccumulatedFault:
   *                 type: number
   *               shiftTemp:
   *                 type: number
   *     responses:
   *       '200':
   *         description: Shift updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: number
   *                 shiftName:
   *                   type: string
   *                 shiftDayStart:
   *                   type: number
 *                 shiftTimeStart:
 *                   type: string
 *                 shiftActiveHours:
 *                   type: number
 *                 shiftActiveMinutes:
 *                   type: number
 *                 shiftRestDays:
 *                   type: string
 *                 shiftAccumulatedFault:
 *                   type: number
 *                 shiftTemp:
 *                   type: number
 *       '400':
   *         description: Invalid input, validation error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *       '404':
   *         description: Shift not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const shift = await Shift.query()
        .where('shiftId', params.id)
        .whereNull('shiftDeletedAt')
        .first()

      if (!shift) {
        return response.status(404).json({
          type: 'error',
          title: 'Not found',
          message: 'ID Shift not found',
          data: null,
        })
      }

      const data = await request.validateUsing(updateShiftValidator)
      const businessConf = `${env.get('SYSTEM_BUSINESS')}`
      const shiftService = new ShiftService()
      const updateShift = {
        shiftId: shift.shiftId,
        shiftName: data.shiftName,
        shiftTimeStart: data.shiftTimeStart,
        shiftActiveHours: data.shiftActiveHours,
        shiftActiveMinutes: data.shiftActiveMinutes || 0,
        shiftRestDays: data.shiftRestDays,
        shiftAccumulatedFault: data.shiftAccumulatedFault,
        shiftCalculateFlag: request.input('shiftCalculateFlag'),
        shiftBusinessUnits: businessConf,
        shiftTemp: data.shiftTemp,
      } as Shift

      const verifyInfo = await shiftService.verifyInfo(updateShift)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }

      shift.merge({ ...data, shiftCalculateFlag: request.input('shiftCalculateFlag') })
      await shift.save()
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resource updated',
        data: shift.toJSON(),
      })
    } catch (error) {
      // Manejar errores de validación
      return response.status(400).json({
        type: 'error',
        title: 'Validation error',
        message: 'Invalid input, validation error',
        data: error.messages || error.message,
      })
    }
  }

  /**
   * @swagger
   * /api/shift/{id}:
   *   delete:
   *     tags:
   *       - Shifts
   *     summary: Soft delete a shift
   *     parameters:
   *       - in: path
   *         name: id
   *         schema:
   *           type: number
   *         required: true
   *         description: Numeric ID of the shift to delete
   *     responses:
   *       '200':
   *         description: Shift deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *       '404':
   *         description: Shift not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   */
  async destroy({ params, response }: HttpContext) {
    try {
      const shift = await Shift.query()
        .where('shiftId', params.id)
        .whereNull('shiftDeletedAt')
        .first()
      if (!shift) {
        return response.status(404).json({
          type: 'error',
          title: 'Not found',
          message: 'ID Shift not found',
          data: null,
        })
      }
      shift.shiftDeletedAt = DateTime.now()
      await shift.save()
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resource deleted',
        data: shift.toJSON(),
      })
    } catch (error) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.status(404).json({
          type: 'error',
          title: 'Not found',
          message: 'Shift not found',
          data: null,
        })
      }
      return response.status(500).json({
        type: 'error',
        title: 'Server error',
        message: 'An error occurred while deleting the shift',
        data: error.message,
      })
    }
  }

  async searchPositionDepartment({ request, response }: HttpContext) {
    try {
      const {
        shiftDayStart,
        shiftName,
        shiftActiveHours,
        departmentId,
        positionId,
        page = 1,
        limit = 10,
      } = request.qs()

      const query = Shift.query()
        .whereNull('shiftDeletedAt')
        .withCount('employees', (employeeQuery) => {
          employeeQuery.whereNull('deletedAt')
          if (departmentId || positionId) {
            employeeQuery.whereHas('employee', (employeeSubQuery) => {
              if (departmentId) {
                employeeSubQuery.where('departmentId', departmentId)
              }
              if (positionId) {
                employeeSubQuery.where('positionId', positionId)
              }
            })
          }
        })
        .preload('employees', (employeeQuery) => {
          employeeQuery
            .whereHas('employee', (employeeSubQuery) => {
              if (departmentId) {
                employeeSubQuery.where('departmentId', departmentId)
              }
              if (positionId) {
                employeeSubQuery.where('positionId', positionId)
              }
            })
            .preload('employee', (employeeSubQuery) => {
              employeeSubQuery.preload('person')
            })
            .whereNull('deletedAt')
        })

      if (shiftDayStart) {
        query.where('shiftDayStart', shiftDayStart)
      }

      if (shiftName) {
        query.where('shiftName', 'LIKE', `%${shiftName}%`)
      }

      if (shiftActiveHours) {
        query.where('shiftActiveHours', shiftActiveHours)
      }

      const shifts = await query.paginate(page, limit)

      const filteredShifts = shifts.all().filter((shift) => shift.$extras.employees_count > 0)

      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resources fetched',
        data: {
          meta: {
            total: filteredShifts.length,
            per_page: shifts.perPage,
            current_page: shifts.currentPage,
            last_page: shifts.lastPage,
            first_page: 1,
          },
          data: filteredShifts.map((shift) => ({
            ...shift.toJSON(),
            employee_count: shift.$extras.employees_count,
            employees: shift.employees.map((employeeShift) => ({
              employeeId: employeeShift.employeeId,
              employeeFirstName: employeeShift.employee?.person?.personFirstname,
              employeeLastName: `${employeeShift.employee.person?.personLastname} ${employeeShift.employee.person?.personSecondLastname}`,
            })),
          })),
        },
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
}
