import { HttpContext } from '@adonisjs/core/http'
import Shift from '../models/shift.js'
import { createShiftValidator, updateShiftValidator } from '../validators/shift.js'
import { DateTime } from 'luxon'
import ShiftService from '#services/shift_service'
import BusinessUnit from '#models/business_unit'
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
 *               shiftRestDays:
 *                 type: string
 *               shiftAccumulatedFault:
 *                 type: number
 *               shiftTemp:
 *                 type: number
 *               shiftLunchTime:
 *                 type: number
 *                 default: 60
 *               shiftCompensableLunchSchedule:
 *                 type: number
 *                 default: 0
 *               shiftColor:
 *                 type: string
 *               shiftAlias:
 *                 type: string
 *                 description: Alias of the shift (must be unique per active business unit)
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
 *                 shiftRestDays:
 *                   type: string
 *                 shiftAccumulatedFault:
 *                   type: number
 *                 shiftAlias:
 *                   type: string
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
  async store({ request, response, businessUnitScope }: HttpContext) {
    try {
      if (businessUnitScope.length === 0) {
        return response.status(403).json({ type: 'error', title: 'Sin acceso', message: 'No tienes unidades de negocio asignadas' })
      }
      const data = await request.validateUsing(createShiftValidator)
      const shiftService = new ShiftService()
      const units = await BusinessUnit.query()
        .whereIn('business_unit_id', businessUnitScope)
        .select('business_unit_slug')
      const businessSlugs = units.map((bu) => bu.businessUnitSlug)
      const shift = {
        shiftName: data.shiftName,
        shiftAlias: data.shiftAlias?.trim() || null,
        shiftTimeStart: data.shiftTimeStart,
        shiftActiveHours: data.shiftActiveHours,
        shiftRestDays: data.shiftRestDays,
        shiftAccumulatedFault: data.shiftAccumulatedFault,
        shiftCalculateFlag: request.input('shiftCalculateFlag'),
        shiftBusinessUnits: businessSlugs.join(','),
        shiftTemp: data.shiftTemp,
        shiftLunchTime: data.shiftLunchTime,
        shiftCompensableLunchSchedule: data.shiftCompensableLunchSchedule,
        shiftColor: data.shiftColor,
      } as Shift
      const verifyInfo = await shiftService.verifyInfo(shift, undefined, businessSlugs)
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
 *                   shiftRestDays:
 *                     type: string
   */
  async index({ request, response, businessUnitScope }: HttpContext) {
    try {
      const { shiftDayStart, shiftName, shiftActiveHours, page = 1, limit = 10 } = request.qs()
      const units = await BusinessUnit.query()
        .whereIn('business_unit_id', businessUnitScope)
        .select('business_unit_slug')
      const businessSlugs = units.map((bu) => bu.businessUnitSlug)

      const shiftQuery = Shift.query()
        .whereNull('shiftDeletedAt')
        .where('shift_temp', 0)
        .andWhere((query) => {
          if (businessSlugs.length === 0) {
            query.whereRaw('1 = 0')
            return
          }
          query.whereNotNull('shift_business_units')
          query.andWhere((subQuery) => {
            businessSlugs.forEach((slug) => {
              subQuery.orWhereRaw('FIND_IN_SET(?, shift_business_units)', [slug.trim()])
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
 *               shiftColor:
 *                 type: string
 *               shiftAlias:
 *                 type: string
 *                 description: Alias of the shift (must be unique per active business unit)
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
 *                 shiftRestDays:
 *                   type: string
 *                 shiftAccumulatedFault:
 *                   type: number
 *                 shiftTemp:
 *                   type: number
 *                 shiftLunchTime:
 *                   type: number
 *                   default: 60
 *                 shiftCompensableLunchSchedule:
 *                   type: number
 *                   default: 0
 *                 shiftColor:
 *                   type: string
 *                 shiftAlias:
 *                   type: string
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
  async update({ params, request, response, businessUnitScope }: HttpContext) {
    try {
      if (businessUnitScope.length === 0) {
        return response.status(403).json({ type: 'error', title: 'Sin acceso', message: 'No tienes unidades de negocio asignadas' })
      }
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
      const units = await BusinessUnit.query()
        .whereIn('business_unit_id', businessUnitScope)
        .select('business_unit_slug')
      const businessSlugs = units.map((bu) => bu.businessUnitSlug)
      const shiftService = new ShiftService()
      const shiftColorInput = request.input('shiftColor')
      const updateShift = {
        shiftId: shift.shiftId,
        shiftName: data.shiftName,
        shiftAlias: data.shiftAlias?.trim() || null,
        shiftTimeStart: data.shiftTimeStart,
        shiftActiveHours: data.shiftActiveHours,
        shiftRestDays: data.shiftRestDays,
        shiftAccumulatedFault: data.shiftAccumulatedFault,
        shiftCalculateFlag: request.input('shiftCalculateFlag'),
        shiftBusinessUnits: businessSlugs.join(','),
        shiftTemp: data.shiftTemp,
        shiftLunchTime: data.shiftLunchTime,
        shiftCompensableLunchSchedule: data.shiftCompensableLunchSchedule,
        shiftColor: shiftColorInput !== undefined && shiftColorInput !== null
          ? data.shiftColor
          : shift.shiftColor,
      } as Shift
      const verifyInfo = await shiftService.verifyInfo(
        updateShift,
        Number.parseInt(params.id),
        businessSlugs
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

      const mergeData: any = {
        ...data,
        shiftAlias: data.shiftAlias?.trim() || null,
        shiftCalculateFlag: request.input('shiftCalculateFlag'),
        shiftBusinessUnits: businessSlugs.join(','),
      }
      if (shiftColorInput !== undefined && shiftColorInput !== null) {
        mergeData.shiftColor = data.shiftColor
      }
      shift.merge(mergeData)
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
