import { HttpContext } from '@adonisjs/core/http'
import EmployeeBonus from '#models/employee_bonus'
import EmployeeBonusService from '#services/employee_bonus_service'
import {
  createEmployeeBonusValidator,
  updateEmployeeBonusValidator,
} from '#validators/employee_bonus'
import { DateTime } from 'luxon'

export default class EmployeeBonusController {
  /**
   * @swagger
   * /api/employee-bonuses:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Bonuses
   *     summary: Obtener bonificaciones de un empleado
   *     parameters:
   *       - name: employeeId
   *         in: query
   *         required: true
   *         description: Identificador del empleado
   *         schema:
   *           type: integer
   *       - name: search
   *         in: query
   *         required: false
   *         description: Término de búsqueda por concepto
   *         schema:
   *           type: string
   *       - name: page
   *         in: query
   *         required: false
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: false
   *         default: 100
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Recurso procesado exitosamente
   *       default:
   *         description: Error inesperado
   */
  async index({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeId = Number(request.input('employeeId'))
      if (!employeeId || Number.isNaN(employeeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('employee_bonuses'),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const search = request.input('search')
      const rawPage = Number(request.input('page', 1))
      const rawLimit = Number(request.input('limit', 100))
      const page = Number.isNaN(rawPage) || rawPage <= 0 ? 1 : rawPage
      const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 100 : rawLimit
      const bonusService = new EmployeeBonusService()
      const bonuses = await bonusService.index({
        search,
        page,
        limit,
        employeeId,
      })
      response.status(200)
      return {
        type: 'success',
        title: t('employee_bonuses'),
        message: t('resources_were_found_successfully'),
        data: { employeeBonuses: bonuses },
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
   * /api/employee-bonuses:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Bonuses
   *     summary: Crear bonificación de empleado
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
   *                 required: true
   *               employeeBonusConcept:
   *                 type: string
   *                 required: true
   *               employeeBonusQuantity:
   *                 type: number
   *                 required: true
   *               employeeBonusUnitAmount:
   *                 type: number
   *                 required: true
   *               employeeBonusTotal:
   *                 type: number
   *                 required: true
   *               employeeBonusAssignmentDate:
   *                 type: string
   *                 format: date
   *                 required: true
   *               employeeBonusPaymentDate:
   *                 type: string
   *                 format: date
   *                 required: true
   *     responses:
   *       '201':
   *         description: Recurso creado exitosamente
   *       default:
   *         description: Error inesperado
   */
  async store({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const bonus = {
        employeeId: Number(request.input('employeeId')),
        employeeBonusConcept: (request.input('employeeBonusConcept', '') || '').toString().trim(),
        employeeBonusQuantity: Number(request.input('employeeBonusQuantity')),
        employeeBonusUnitAmount: Number(request.input('employeeBonusUnitAmount')),
        employeeBonusTotal: Number(request.input('employeeBonusTotal')),
        employeeBonusAssignmentDate: DateTime.fromISO(
          request.input('employeeBonusAssignmentDate')
        ),
        employeeBonusPaymentDate: DateTime.fromISO(request.input('employeeBonusPaymentDate')),
      } as unknown as EmployeeBonus

      await request.validateUsing(createEmployeeBonusValidator)
      const bonusService = new EmployeeBonusService()
      const newBonus = await bonusService.create(bonus)
      response.status(201)
      return {
        type: 'success',
        title: t('employee_bonuses'),
        message: t('resource_was_created_successfully'),
        data: { employeeBonus: newBonus },
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
   * /api/employee-bonuses/{employeeBonusId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Bonuses
   *     summary: Actualizar bonificación de empleado
   *     parameters:
   *       - in: path
   *         name: employeeBonusId
   *         schema:
   *           type: number
   *         description: Identificador de la bonificación
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeBonusConcept:
   *                 type: string
   *               employeeBonusQuantity:
   *                 type: number
   *               employeeBonusUnitAmount:
   *                 type: number
   *               employeeBonusTotal:
   *                 type: number
   *               employeeBonusAssignmentDate:
   *                 type: string
   *                 format: date
   *               employeeBonusPaymentDate:
   *                 type: string
   *                 format: date
   *     responses:
   *       '201':
   *         description: Recurso actualizado exitosamente
   *       default:
   *         description: Error inesperado
   */
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeBonusId = Number(request.param('employeeBonusId'))
      if (!employeeBonusId || Number.isNaN(employeeBonusId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('employee_bonuses'),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const currentBonus = await EmployeeBonus.query()
        .whereNull('employee_bonus_deleted_at')
        .where('employee_bonus_id', employeeBonusId)
        .first()
      if (!currentBonus) {
        response.status(404)
        return {
          type: 'warning',
          title: t('employee_bonuses'),
          message: t('entity_was_not_found_with_entered_id', { entity: t('bonus') }),
          data: { employeeBonusId },
        }
      }
      const bonusService = new EmployeeBonusService()
      if (bonusService.isPaymentDateExpired(currentBonus.employeeBonusPaymentDate)) {
        response.status(422)
        return {
          type: 'warning',
          title: t('employee_bonuses'),
          message: t('cannot_modify_past_bonus'),
          data: { employeeBonusId },
        }
      }
      const bonus = {
        employeeBonusConcept: (request.input('employeeBonusConcept', '') || '').toString().trim(),
        employeeBonusQuantity: Number(request.input('employeeBonusQuantity')),
        employeeBonusUnitAmount: Number(request.input('employeeBonusUnitAmount')),
        employeeBonusTotal: Number(request.input('employeeBonusTotal')),
        employeeBonusAssignmentDate: DateTime.fromISO(
          request.input('employeeBonusAssignmentDate')
        ),
        employeeBonusPaymentDate: DateTime.fromISO(request.input('employeeBonusPaymentDate')),
      } as unknown as EmployeeBonus

      await request.validateUsing(updateEmployeeBonusValidator)
      const updatedBonus = await bonusService.update(currentBonus, bonus)
      response.status(201)
      return {
        type: 'success',
        title: t('employee_bonuses'),
        message: t('resource_was_updated_successfully'),
        data: { employeeBonus: updatedBonus },
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
   * /api/employee-bonuses/{employeeBonusId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Bonuses
   *     summary: Eliminar bonificación de empleado
   *     parameters:
   *       - in: path
   *         name: employeeBonusId
   *         schema:
   *           type: number
   *         description: Identificador de la bonificación
   *         required: true
   *     responses:
   *       '201':
   *         description: Recurso eliminado exitosamente
   *       default:
   *         description: Error inesperado
   */
  async delete({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeBonusId = Number(request.param('employeeBonusId'))
      if (!employeeBonusId || Number.isNaN(employeeBonusId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('employee_bonuses'),
          message: t('missing_data_to_process'),
          data: { employeeBonusId },
        }
      }
      const currentBonus = await EmployeeBonus.query()
        .whereNull('employee_bonus_deleted_at')
        .where('employee_bonus_id', employeeBonusId)
        .first()
      if (!currentBonus) {
        response.status(404)
        return {
          type: 'warning',
          title: t('employee_bonuses'),
          message: t('entity_was_not_found_with_entered_id', { entity: t('bonus') }),
          data: { employeeBonusId },
        }
      }
      const bonusService = new EmployeeBonusService()
      if (bonusService.isPaymentDateExpired(currentBonus.employeeBonusPaymentDate)) {
        response.status(422)
        return {
          type: 'warning',
          title: t('employee_bonuses'),
          message: t('cannot_modify_past_bonus'),
          data: { employeeBonusId },
        }
      }
      const deletedBonus = await bonusService.delete(currentBonus)
      response.status(201)
      return {
        type: 'success',
        title: t('employee_bonuses'),
        message: t('resource_was_deleted_successfully'),
        data: { employeeBonus: deletedBonus },
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
   * /api/employee-bonuses/{employeeBonusId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Bonuses
   *     summary: Obtener bonificación por ID
   *     parameters:
   *       - in: path
   *         name: employeeBonusId
   *         schema:
   *           type: number
   *         description: Identificador de la bonificación
   *         required: true
   *     responses:
   *       '200':
   *         description: Recurso procesado exitosamente
   *       default:
   *         description: Error inesperado
   */
  async show({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeBonusId = Number(request.param('employeeBonusId'))
      if (!employeeBonusId || Number.isNaN(employeeBonusId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('employee_bonuses'),
          message: t('missing_data_to_process'),
          data: { employeeBonusId },
        }
      }
      const bonusService = new EmployeeBonusService()
      const bonus = await bonusService.show(employeeBonusId)
      if (!bonus) {
        response.status(404)
        return {
          type: 'warning',
          title: t('employee_bonuses'),
          message: t('entity_was_not_found_with_entered_id', { entity: t('bonus') }),
          data: { employeeBonusId },
        }
      }
      response.status(200)
      return {
        type: 'success',
        title: t('employee_bonuses'),
        message: t('resource_was_found_successfully'),
        data: { employeeBonus: bonus },
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
   * /api/employee-bonuses/concepts/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Bonuses
   *     summary: Obtener conceptos únicos de bonificaciones de un empleado
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Identificador del empleado
   *         required: true
   *     responses:
   *       '200':
   *         description: Recurso procesado exitosamente
   *       default:
   *         description: Error inesperado
   */
  async concepts({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeId = Number(request.param('employeeId'))
      if (!employeeId || Number.isNaN(employeeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('employee_bonuses'),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const bonusService = new EmployeeBonusService()
      const concepts = await bonusService.getConceptsByEmployee(employeeId)
      response.status(200)
      return {
        type: 'success',
        title: t('employee_bonuses'),
        message: t('resources_were_found_successfully'),
        data: { concepts },
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
