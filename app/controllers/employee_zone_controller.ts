import { HttpContext } from '@adonisjs/core/http'
import EmployeeZone from '#models/employee_zone'
import EmployeeZoneService from '#services/employee_zone_service'
import { createEmployeeZoneValidator, updateEmployeeZoneValidator } from '#validators/employee_zone'

export default class EmployeeZoneController {
  /**
   * @swagger
   * /api/employee-zones:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Zones
   *     summary: create new employee zone
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeId:
   *                 type: number
   *                 description: Employee id
   *                 required: true
   *                 default: ''
   *               zoneId:
   *                 type: number
   *                 description: Zone id
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
  async store({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      await request.validateUsing(createEmployeeZoneValidator)
      const employeeZoneService = new EmployeeZoneService(i18n)
      const employeeId = request.input('employeeId')
      const zoneId = request.input('zoneId')
      const employeeZone = {
        employeeId: employeeId,
        zoneId: zoneId,
      } as EmployeeZone

      const exist = await employeeZoneService.verifyInfoExist(employeeZone)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...employeeZone },
        }
      }
      const newEmployeeZone = await employeeZoneService.create(employeeZone)
      if (newEmployeeZone) {
        response.status(201)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_created_successfully'),
          data: { employeeZone: newEmployeeZone },
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/employee-zones/{employeeZoneId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Zones
   *     summary: update empoyee zone
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeZoneId
   *         schema:
   *           type: number
   *         description: Employee zone id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeId:
   *                 type: number
   *                 description: Employee id
   *                 required: true
   *                 default: 0
   *               zoneId:
   *                 type: number
   *                 description: Zone id
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
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeZoneService = new EmployeeZoneService(i18n)
      const employeeZoneId = request.param('employeeZoneId')
      const employeeId = request.input('employeeId')
      const zoneId = request.input('zoneId')
      const employeeZone = {
        employeeZoneId: employeeZoneId,
        employeeId: employeeId,
        zoneId: zoneId
      } as EmployeeZone
      if (!employeeZoneId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { ...employeeZone },
        }
      }
      const currentEmployeeZone = await EmployeeZone.query()
        .whereNull('employee_zone_deleted_at')
        .where('employee_zone_id', employeeZoneId)
        .first()
      if (!currentEmployeeZone) {
        const entity = `${t('relation')} ${t('employee')} - ${t('zone')}`
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { ...employeeZone },
        }
      }

      await request.validateUsing(updateEmployeeZoneValidator)
      const updateEmployeeZone = await employeeZoneService.update(currentEmployeeZone, employeeZone)
      if (updateEmployeeZone) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_updated_successfully'),
          data: { employeeZone: updateEmployeeZone },
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/employee-zones/{employeeZoneId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Zones
   *     summary: delete employee zone
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeZoneId
   *         schema:
   *           type: number
   *         description: Employee zone id
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
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeZoneId = request.param('employeeZoneId')
      if (!employeeZoneId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { employeeZoneId },
        }
      }
      const currentEmployeeZone = await EmployeeZone.query()
          .whereNull('employee_zone_deleted_at')
        .where('employee_zone_id', employeeZoneId)
        .first()
      if (!currentEmployeeZone) {
        const entity = `${t('relation')} ${t('employee')} - ${t('zone')}`
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { employeeZoneId },
        }
      }
      const employeeZoneService = new EmployeeZoneService(i18n)
      const deleteEmployeeZone = await employeeZoneService.delete(currentEmployeeZone)
      if (deleteEmployeeZone) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { employeeZone: deleteEmployeeZone },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employee-zones/{employeeZoneId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Zones
   *     summary: get employee zone by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeZoneId
   *         schema:
   *           type: number
   *         description: Employee zone id
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
  async show({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeZoneId = request.param('employeeZoneId')
      if (!employeeZoneId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { employeeZoneId },
        }
      }
      const employeeZoneService = new EmployeeZoneService(i18n)
      const showEmployeeZone = await employeeZoneService.show(employeeZoneId)
      if (!showEmployeeZone) {
        const entity = `${t('relation')} ${t('employee')} - ${t('zone')}`
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { employeeZoneId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_found_successfully'),
          data: { employeeZone: showEmployeeZone },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }
}
