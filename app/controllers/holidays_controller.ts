import Icon from '#models/icon'
import HolidayService from '#services/holiday_service'
import Holiday from '../models/holiday.js'
import { createOrUpdateHolidayValidator } from '../validators/holiday.js'
import { HttpContext } from '@adonisjs/core/http'
import env from '../../start/env.js'

/**
 * @swagger
 * tags:
 *   name: Holiday
 *   description: Holiday management
 */

export default class HolidayController {
  /**
   * @swagger
   * /api/holidays:
   *   get:
   *     tags: [Holiday]
   *     summary: Get all holidays
   *     description: Retrieve a list of all holidays with pagination and search functionality.
   *     parameters:
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Search term for holiday name
   *       - in: query
   *         name: firstDate
   *         schema:
   *           type: string
   *         description: first date to filter holidays
   *       - in: query
   *         name: lastDate
   *         schema:
   *           type: string
   *         description: last date to filter holidays
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Page number for pagination
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 100
   *         description: Number of holidays per page
   *     responses:
   *       200:
   *         description: Successfully fetched resources
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Successfully action
   *                 message:
   *                   type: string
   *                   example: Resources fetched
   *                 data:
   *                   type: object
   *                   properties:
   *                     total:
   *                       type: integer
   *                       example: 1
   *                     perPage:
   *                       type: integer
   *                       example: 100
   *                     page:
   *                       type: integer
   *                       example: 1
   *                     lastPage:
   *                       type: integer
   *                       example: 1
   *                     data:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/Holiday'
   *       500:
   *         description: Server error
   */
  async index({ response, request, i18n }: HttpContext) {
    try {
      const search = request.input('search')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const firstDate = request.input('firstDate')
      const lastDate = request.input('lastDate')

      const service = await new HolidayService(i18n).index(firstDate, lastDate, search, page, limit)

      return response.status(service.status).json(service)
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
   * /api/holidays:
   *   post:
   *     tags: [Holiday]
   *     summary: Create a new holiday
   *     description: Create a new holiday.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/Holiday'
   *     responses:
   *       201:
   *         description: Resource created
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Successfully action
   *                 message:
   *                   type: string
   *                   example: Resource created
   *                 data:
   *                   $ref: '#/components/schemas/Holiday'
   *       400:
   *         description: Validation error
   */
  async store({ request, response, i18n }: HttpContext) {
    // try {

    let holiday = null as any
    const holidayName = request.input('holidayName')
    let holidayDate = request.input('holidayDate')
    holidayDate = (holidayDate.split('T')[0] + ' 00:000:00').replace('"', '')
    const holidayIconId = request.input('holidayIconId')
    const icon = await Icon.findOrFail(holidayIconId)
    const holidayIcon = icon.iconSvg
    const holidayFrequency = request.input('holidayFrequency')
    const holidayRequest = {
      holidayDate,
      holidayFrequency: holidayFrequency,
      holidayIcon,
      holidayName,
      holidayIconId,
    } as Holiday
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const data = await request.validateUsing(createOrUpdateHolidayValidator)
    for (let index = 0; index < data.holidayFrequency; index++) {
      const splitDate = holidayRequest.holidayDate.split('-')
      const year = Number.parseInt(splitDate[0])
      const date = year + index + '-' + splitDate[1] + '-' + splitDate[2]
      const holidayData = {
        ...holidayRequest,
        holidayDate: date,
        holidayFrequency: data.holidayFrequency - index,
        holidayBusinessUnits: businessConf,
      }
      if (index === 0) {
        holiday = await Holiday.create(holidayData)
      } else {
        await Holiday.create(holidayData)
      }
    }

    const today = new Date()
    const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const dateParts = holidayDate.split(' ')[0]

    const newHolidayDate = new Date(dateParts + 'T00:00:00')
    if (newHolidayDate <= todayAtMidnight) {
      const holidayService = new HolidayService(i18n)
      const date = typeof newHolidayDate === 'string' ? new Date(newHolidayDate) : newHolidayDate
      await holidayService.updateAssistCalendar(date)
    }

    return response.status(201).json({
      type: 'success',
      title: 'Successfully action',
      message: 'Resource created',
      data: holiday.toJSON(),
    })
    // } catch (error) {
    //   return response.status(400).json({
    //     type: 'error',
    //     title: 'Validation error',
    //     message: error.messages,
    //     data: error,
    //   })
    // }
  }

  /**
   * @swagger
   * /api/holidays/{id}:
   *   get:
   *     tags: [Holiday]
   *     summary: Get a holiday by ID
   *     description: Retrieve a single holiday by its ID.
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: ID of the holiday to retrieve
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Successfully fetched resource
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Successfully action
   *                 message:
   *                   type: string
   *                   example: Resource fetched
   *                 data:
   *                   $ref: '#/components/schemas/Holiday'
   *       404:
   *         description: Resource not found
   */
  async show({ params, response }: HttpContext) {
    try {
      const holiday = await Holiday.query().where('holidayId', params.id).first()

      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resource fetched',
        data: holiday,
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
   * /api/holidays/{id}:
   *   put:
   *     tags: [Holiday]
   *     summary: Update a holiday
   *     description: Update an existing holiday by its ID.
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: ID of the holiday to update
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/Holiday'
   *     responses:
   *       200:
   *         description: Resource updated
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Successfully action
   *                 message:
   *                   type: string
   *                   example: Resource updated
   *                 data:
   *                   $ref: '#/components/schemas/Holiday'
   *       400:
   *         description: Validation error
   */
  async update({ params, request, response, i18n }: HttpContext) {
    try {
      let holidayDate = request.input('holidayDate')
      holidayDate = (holidayDate.split('T')[0] + ' 00:000:00').replace('"', '')
      let data = await request.validateUsing(createOrUpdateHolidayValidator)
      const holidayIconId = request.input('holidayIconId')
      const icon = await Icon.findOrFail(holidayIconId)
      const holidayIcon = icon.iconSvg
      const holiday = await Holiday.findOrFail(params.id)
      const holidayDatePast = holiday.holidayDate
      data = { ...data, holidayDate: holidayDate, holidayIcon: holidayIcon }
      holiday.merge(data)
      await holiday.save()

      const today = new Date()
      const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const dateParts = holidayDate.split(' ')[0]
      const newHolidayDate = new Date(dateParts + 'T00:00:00')
      if (newHolidayDate <= todayAtMidnight) {
        const holidayService = new HolidayService(i18n)
        const date = typeof newHolidayDate === 'string' ? new Date(newHolidayDate) : newHolidayDate
        await holidayService.updateAssistCalendar(date)
      }

      const newHolidayDatePast = new Date(holidayDatePast)
      const datePast = typeof newHolidayDatePast === 'string' ? new Date(newHolidayDatePast) : newHolidayDatePast
      if (newHolidayDate.toISOString() !== datePast.toISOString()) {
        if (datePast <= todayAtMidnight) {
          const holidayService = new HolidayService(i18n)
          await holidayService.updateAssistCalendar(datePast)
        }
      }
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resource updated',
        data: holiday.toJSON(),
      })
    } catch (error) {
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
   * /api/holidays/{id}:
   *   delete:
   *     tags: [Holiday]
   *     summary: Delete a holiday
   *     description: Delete an existing holiday by its ID.
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: ID of the holiday to delete
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Resource deleted
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Successfully action
   *                 message:
   *                   type: string
   *                   example: Resource deleted
   *                 data:
   *                   $ref: '#/components/schemas/Holiday'
   *       404:
   *         description: Resource not found
   */
  async destroy({ params, response, i18n }: HttpContext) {
    try {
      const holiday = await Holiday.findOrFail(params.id)
      await holiday.delete()
      
      const today = new Date()
      const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      
      const holidayDate = holiday.holidayDate
      const newHolidayDate = new Date(holidayDate)
      const date = typeof newHolidayDate === 'string' ? new Date(newHolidayDate) : newHolidayDate

      if (date <= todayAtMidnight) {
        const holidayService = new HolidayService(i18n)
        await holidayService.updateAssistCalendar(date)
      }

      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resource deleted',
        data: holiday.toJSON(),
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
}
