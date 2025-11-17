import { HttpContext } from '@adonisjs/core/http'
import SystemSettingPayrollConfig from '#models/system_setting_payroll_config'
import SystemSettingPayrollConfigService from '#services/system_setting_payroll_config_service'
import { createSystemSettingPayrollConfigValidator } from '#validators/system_setting_payroll_config'
import { DateTime } from 'luxon'
export default class SystemSettingPayrollConfigController {
  /**
   * @swagger
   * /api/system-setting-payroll-configs:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Setting Payroll Configs
   *     summary: create new system setting payroll config
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               systemSettingPayrollConfigPaymentType:
   *                 type: string
   *                 description: System setting payroll config payment type
   *                 required: true
   *               systemSettingPayrollConfigFixedDay:
   *                 type: string
   *                 description: System setting payroll config fixed day
   *                 required: false
   *               systemSettingPayrollConfigFixedEveryNWeeks:
   *                 type: number
   *                 description: System setting payroll config fixed every N weeks
   *                 required: false
   *               systemSettingPayrollConfigNumberOfDaysToBePaid:
   *                 type: number
   *                 description: System setting payroll config number of days to be paid
   *                 required: false
   *               systemSettingPayrollConfigNumberOfDaysEndToBePaid:
   *                 type: number
   *                 description: System setting payroll config number of days end to be paid
   *                 required: false
   *               systemSettingPayrollConfigAdvanceDateInMonthsOf31Days:
   *                 type: boolean
   *                 description: System setting payroll config advance date in months of 31 days
   *                 required: false
   *               systemSettingPayrollConfigAdvanceDateOnHolidays:
   *                 type: boolean
   *                 description: System setting payroll config advance date on holidays
   *                 required: false
   *               systemSettingPayrollConfigAdvanceDateOnWeekends:
   *                 type: boolean
   *                 description: System setting payroll config advance date on weekends
   *                 required: false
   *               systemSettingPayrollConfigNumberOfOverdueDaysToOffset:
   *                 type: number
   *                 description: System setting payroll config number of overdue days to offset
   *                 required: false
   *               systemSettingPayrollConfigApplySince:
   *                 type: string
   *                 format: date
   *                 description: System setting payroll config apply since (YYYY-MM-DD)
   *                 required: true
   *               systemSettingId:
   *                 type: number
   *                 description: System setting id
   *                 required: true
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
      const systemSettingPayrollConfigPaymentType = request.input('systemSettingPayrollConfigPaymentType')
      const systemSettingPayrollConfigFixedDay = request.input('systemSettingPayrollConfigFixedDay')
      const systemSettingPayrollConfigFixedEveryNWeeks = request.input('systemSettingPayrollConfigFixedEveryNWeeks')
      const systemSettingPayrollConfigNumberOfDaysToBePaid = request.input('systemSettingPayrollConfigNumberOfDaysToBePaid')
      const systemSettingPayrollConfigNumberOfDaysEndToBePaid = request.input('systemSettingPayrollConfigNumberOfDaysEndToBePaid')
      const systemSettingPayrollConfigAdvanceDateInMonthsOf31Days = request.input('systemSettingPayrollConfigAdvanceDateInMonthsOf31Days')
      const systemSettingPayrollConfigAdvanceDateOnHolidays = request.input('systemSettingPayrollConfigAdvanceDateOnHolidays')
      const systemSettingPayrollConfigAdvanceDateOnWeekends = request.input('systemSettingPayrollConfigAdvanceDateOnWeekends')
      const systemSettingPayrollConfigNumberOfOverdueDaysToOffset = request.input('systemSettingPayrollConfigNumberOfOverdueDaysToOffset')
      const systemSettingPayrollConfigApplySince = request.input('systemSettingPayrollConfigApplySince')
      const systemSettingId = request.input('systemSettingId')
      const date = DateTime.fromISO(systemSettingPayrollConfigApplySince)
      const dateApplySince = date.toISODate()
      const systemSettingPayrollConfig = {
        systemSettingPayrollConfigPaymentType: systemSettingPayrollConfigPaymentType,
        systemSettingPayrollConfigFixedDay: systemSettingPayrollConfigFixedDay,
        systemSettingPayrollConfigFixedEveryNWeeks: systemSettingPayrollConfigFixedEveryNWeeks,
        systemSettingPayrollConfigNumberOfDaysToBePaid: systemSettingPayrollConfigNumberOfDaysToBePaid,
        systemSettingPayrollConfigNumberOfDaysEndToBePaid: systemSettingPayrollConfigNumberOfDaysEndToBePaid,
        systemSettingPayrollConfigAdvanceDateInMonthsOf31Days: systemSettingPayrollConfigAdvanceDateInMonthsOf31Days,
        systemSettingPayrollConfigAdvanceDateOnHolidays: systemSettingPayrollConfigAdvanceDateOnHolidays,
        systemSettingPayrollConfigAdvanceDateOnWeekends: systemSettingPayrollConfigAdvanceDateOnWeekends ,
        systemSettingPayrollConfigNumberOfOverdueDaysToOffset: systemSettingPayrollConfigNumberOfOverdueDaysToOffset,
        systemSettingPayrollConfigApplySince: dateApplySince,
        systemSettingId: systemSettingId
      } as SystemSettingPayrollConfig
      const systemSettingPayrollConfigService = new SystemSettingPayrollConfigService()
      const data = await request.validateUsing(createSystemSettingPayrollConfigValidator)
      const exist = await systemSettingPayrollConfigService.verifyInfoExist(systemSettingPayrollConfig)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await systemSettingPayrollConfigService.verifyInfo(systemSettingPayrollConfig)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const newSystemSettingPayrollConfig = await systemSettingPayrollConfigService.create(systemSettingPayrollConfig)
      response.status(201)
      return {
        type: 'success',
        title: 'System setting payroll configs',
        message: 'The system setting payroll config was created successfully',
        data: { systemSettingPayrollConfig: newSystemSettingPayrollConfig },
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
   * /api/system-setting-payroll-configs/{systemSettingPayrollConfigId}:
   *   put:
   *     tags:
   *       - System Setting Payroll Configs
   *     summary: update system setting payroll config
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: systemSettingPayrollConfigId
   *         schema:
   *           type: number
   *         description: System setting payroll config id
   *         required: true
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               systemSettingPayrollConfigPaymentType:
   *                 type: string
   *                 description: System setting payroll config payment type
   *                 required: true
   *               systemSettingPayrollConfigFixedDay:
   *                 type: string
   *                 description: System setting payroll config fixed day
   *                 required: false
   *               systemSettingPayrollConfigFixedEveryNWeeks:
   *                 type: number
   *                 description: System setting payroll config fixed every N weeks
   *                 required: false
   *               systemSettingPayrollConfigNumberOfDaysToBePaid:
   *                 type: number
   *                 description: System setting payroll config number of days to be paid
   *                 required: false
   *               systemSettingPayrollConfigNumberOfDaysEndToBePaid:
   *                 type: number
   *                 description: System setting payroll config number of days end to be paid
   *                 required: false
   *               systemSettingPayrollConfigAdvanceDateInMonthsOf31Days:
   *                 type: boolean
   *                 description: System setting payroll config advance date in months of 31 days
   *                 required: false
   *               systemSettingPayrollConfigAdvanceDateOnHolidays:
   *                 type: boolean
   *                 description: System setting payroll config advance date on holidays
   *                 required: false
   *               systemSettingPayrollConfigAdvanceDateOnWeekends:
   *                 type: boolean
   *                 description: System setting payroll config advance date on weekends
   *                 required: false
   *               systemSettingPayrollConfigNumberOfOverdueDaysToOffset:
   *                 type: number
   *                 description: System setting payroll config number of overdue days to offset
   *                 required: false
   *               systemSettingPayrollConfigApplySince:
   *                 type: string
   *                 format: date
   *                 description: System setting payroll config apply since (YYYY-MM-DD)
   *                 required: false
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
      const systemSettingPayrollConfigId = request.param('systemSettingPayrollConfigId')
      const systemSettingPayrollConfigPaymentType = request.input('systemSettingPayrollConfigPaymentType')
      const systemSettingPayrollConfigFixedDay = request.input('systemSettingPayrollConfigFixedDay')
      const systemSettingPayrollConfigFixedEveryNWeeks = request.input('systemSettingPayrollConfigFixedEveryNWeeks')
      const systemSettingPayrollConfigNumberOfDaysToBePaid = request.input('systemSettingPayrollConfigNumberOfDaysToBePaid')
      const systemSettingPayrollConfigNumberOfDaysEndToBePaid = request.input('systemSettingPayrollConfigNumberOfDaysEndToBePaid')
      const systemSettingPayrollConfigAdvanceDateInMonthsOf31Days = request.input('systemSettingPayrollConfigAdvanceDateInMonthsOf31Days')
      const systemSettingPayrollConfigAdvanceDateOnHolidays = request.input('systemSettingPayrollConfigAdvanceDateOnHolidays')
      const systemSettingPayrollConfigAdvanceDateOnWeekends = request.input('systemSettingPayrollConfigAdvanceDateOnWeekends')
      const systemSettingPayrollConfigNumberOfOverdueDaysToOffset = request.input('systemSettingPayrollConfigNumberOfOverdueDaysToOffset')
      const systemSettingPayrollConfigApplySince = request.input('systemSettingPayrollConfigApplySince')
      const systemSettingPayrollConfig = {
        systemSettingPayrollConfigId: systemSettingPayrollConfigId,
        systemSettingPayrollConfigPaymentType: systemSettingPayrollConfigPaymentType,
        systemSettingPayrollConfigFixedDay: systemSettingPayrollConfigFixedDay,
        systemSettingPayrollConfigFixedEveryNWeeks: systemSettingPayrollConfigFixedEveryNWeeks,
        systemSettingPayrollConfigNumberOfDaysToBePaid: systemSettingPayrollConfigNumberOfDaysToBePaid,
        systemSettingPayrollConfigNumberOfDaysEndToBePaid: systemSettingPayrollConfigNumberOfDaysEndToBePaid,
        systemSettingPayrollConfigAdvanceDateInMonthsOf31Days: systemSettingPayrollConfigAdvanceDateInMonthsOf31Days,
        systemSettingPayrollConfigAdvanceDateOnHolidays: systemSettingPayrollConfigAdvanceDateOnHolidays,
        systemSettingPayrollConfigAdvanceDateOnWeekends: systemSettingPayrollConfigAdvanceDateOnWeekends ,
        systemSettingPayrollConfigNumberOfOverdueDaysToOffset: systemSettingPayrollConfigNumberOfOverdueDaysToOffset,
        systemSettingPayrollConfigApplySince: systemSettingPayrollConfigApplySince,
      } as SystemSettingPayrollConfig
      if (!systemSettingPayrollConfigId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The system setting payroll config id was not found',
          data: { ...systemSettingPayrollConfig },
        }
      }
      const currentSystemSettingPayrollConfig = await SystemSettingPayrollConfig.query()
        .whereNull('system_setting_payroll_config_deleted_at')
        .where('system_setting_payroll_config_id', systemSettingPayrollConfigId)
        .first()
      if (!currentSystemSettingPayrollConfig) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The system setting payroll config was not found',
          message: 'The system setting payroll config was not found with the entered ID',
          data: { ...systemSettingPayrollConfig },
        }
      }
      const systemSettingPayrollConfigService = new SystemSettingPayrollConfigService()
      const updateSystemSettingPayrollConfig = await systemSettingPayrollConfigService.update(
        currentSystemSettingPayrollConfig,
        systemSettingPayrollConfig
      )
      response.status(200)
      return {
        type: 'success',
        title: 'System setting payroll configs',
        message: 'The system setting payroll config was updated successfully',
        data: { systemSettingPayrollConfig: updateSystemSettingPayrollConfig },
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
   * /api/system-setting-payroll-configs/{systemSettingPayrollConfigId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Setting Payroll Configs
   *     summary: delete system setting payroll config
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: systemSettingPayrollConfigId
   *         schema:
   *           type: number
   *         description: System setting payroll config id
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
      const systemSettingPayrollConfigId = request.param('systemSettingPayrollConfigId')
      if (!systemSettingPayrollConfigId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The system setting payroll config Id was not found',
          message: 'Missing data to process',
          data: { systemSettingPayrollConfigId },
        }
      }
      const currentSystemSettingPayrollConfig = await SystemSettingPayrollConfig.query()
        .whereNull('system_setting_payroll_config_deleted_at')
        .where('system_setting_payroll_config_id', systemSettingPayrollConfigId)
        .first()
      if (!currentSystemSettingPayrollConfig) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The system setting payroll config was not found',
          message: 'The system setting payroll config was not found with the entered ID',
          data: { systemSettingPayrollConfigId },
        }
      }
      const systemSettingPayrollConfigService = new SystemSettingPayrollConfigService()
      const deleteSystemSettingPayrollConfig = await systemSettingPayrollConfigService.delete(currentSystemSettingPayrollConfig)
      if (deleteSystemSettingPayrollConfig) {
        response.status(200)
        return {
          type: 'success',
          title: 'System setting payroll configs',
          message: 'The system setting payroll config was deleted successfully',
          data: { systemSettingPayrollConfig: deleteSystemSettingPayrollConfig },
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
   * /api/system-setting-payroll-configs/{systemSettingPayrollConfigId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - System Setting Payroll Configs
   *     summary: get system setting payroll config by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: systemSettingPayrollConfigId
   *         schema:
   *           type: number
   *         description: System setting payroll config id
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
      const systemSettingPayrollConfigId = request.param('systemSettingPayrollConfigId')
      if (!systemSettingPayrollConfigId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The system setting payroll config Id was not found',
          message: 'Missing data to process',
          data: { systemSettingPayrollConfigId },
        }
      }
      const systemSettingPayrollConfigService = new SystemSettingPayrollConfigService()
      const showSystemSettingPayrollConfig = await systemSettingPayrollConfigService.show(systemSettingPayrollConfigId)
      if (!showSystemSettingPayrollConfig) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The system setting payroll config was not found',
          message: 'The system setting payroll config was not found with the entered ID',
          data: { systemSettingPayrollConfigId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'System setting payroll configs',
          message: 'The system setting payroll config was found successfully',
          data: { systemSettingPayrollConfig: showSystemSettingPayrollConfig },
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
}
