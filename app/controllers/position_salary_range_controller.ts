import { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import PositionSalaryRangeService, {
  type ServiceError,
  type CreateRangeSuccess,
  type GetCurrentSuccess,
  type UpdateVersionSuccess,
  type GetHistorySuccess,
  type GetAuditSuccess,
} from '#services/position_salary_range_service'
import {
  createPositionSalaryRangeValidator,
  updatePositionSalaryRangeValidator,
  closePositionSalaryRangeValidator,
} from '#validators/position_salary_range'

export default class PositionSalaryRangeController {
  /**
   * @swagger
   * /api/position-salary-ranges:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Salary Ranges
   *     summary: Crear un nuevo rango salarial para un puesto
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [businessUnitId, positionId, minSalaryDaily, maxSalaryDaily, validFrom]
   *             properties:
   *               businessUnitId:
   *                 type: integer
   *               positionId:
   *                 type: integer
   *               minSalaryDaily:
   *                 type: number
   *                 description: Salario mínimo diario
   *               maxSalaryDaily:
   *                 type: number
   *                 description: Salario máximo diario
   *               validFrom:
   *                 type: string
   *                 format: date
   *               reason:
   *                 type: string
   *     responses:
   *       '201':
   *         description: Rango creado correctamente
   *       '409':
   *         description: Ya existe un rango vigente para ese puesto en esa razón social
   *       '422':
   *         description: Datos inválidos (min > max, referencia inexistente, body inválido)
   */
  async store({ request, response, auth }: HttpContext) {
    try {
      const data = await request.validateUsing(createPositionSalaryRangeValidator)

      const validFromDateTime = DateTime.fromJSDate(data.validFrom)
      if (!validFromDateTime.isValid) {
        response.status(422)
        return {
          type: 'warning',
          title: 'Datos inválidos',
          message: 'La fecha de inicio de vigencia no es válida',
          key: 'body-invalido',
        }
      }

      const actorId = auth.user!.userId
      const service = new PositionSalaryRangeService()
      const result = await service.create({
        businessUnitId: data.businessUnitId,
        positionId: data.positionId,
        minSalaryDaily: data.minSalaryDaily,
        maxSalaryDaily: data.maxSalaryDaily,
        validFrom: validFromDateTime,
        reason: data.reason,
        createdBy: actorId,
      })

      if (result.status !== 201) {
        const err = result as ServiceError
        response.status(err.status)
        return {
          type: 'warning',
          title: err.title,
          message: err.message,
          key: err.key,
        }
      }

      response.status(201)
      return {
        type: 'success',
        title: 'Rango salarial creado',
        message: 'El rango salarial fue creado correctamente',
        data: { positionSalaryRange: (result as CreateRangeSuccess).range },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(422)
      return {
        type: 'error',
        title: 'Datos inválidos',
        message: messageError,
        key: 'body-invalido',
      }
    }
  }

  /**
   * @swagger
   * /api/position-salary-ranges:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Salary Ranges
   *     summary: Listar rangos salariales de una razón social
   *     parameters:
   *       - in: query
   *         name: razon_social_id
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: position_id
   *         schema:
   *           type: integer
   *       - in: query
   *         name: include_history
   *         schema:
   *           type: boolean
   *           default: false
   *     responses:
   *       '200':
   *         description: Lista de rangos
   *       '422':
   *         description: razon_social_id requerido
   */
  async index({ request, response }: HttpContext) {
    try {
      const businessUnitId = Number(request.qs().razon_social_id)
      const positionId = request.qs().position_id ? Number(request.qs().position_id) : undefined
      const includeHistory = request.qs().include_history === 'true'

      if (!businessUnitId || Number.isNaN(businessUnitId)) {
        response.status(422)
        return {
          type: 'warning',
          title: 'Datos inválidos',
          message: 'El parámetro razon_social_id es obligatorio',
          key: 'body-invalido',
        }
      }

      const service = new PositionSalaryRangeService()
      const result = await service.list({ businessUnitId, positionId, includeHistory })

      response.status(200)
      return {
        type: 'success',
        title: 'Rangos salariales',
        message: 'Los rangos salariales fueron encontrados correctamente',
        data: result.data,
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ha ocurrido un error inesperado en el servidor',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/position-salary-ranges/current:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Salary Ranges
   *     summary: Consultar el rango vigente de un puesto en una razón social
   *     parameters:
   *       - in: query
   *         name: razon_social_id
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: position_id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Rango vigente encontrado
   *       '404':
   *         description: No existe rango vigente
   *       '422':
   *         description: Parámetros inválidos
   */
  async current({ request, response }: HttpContext) {
    try {
      const businessUnitId = Number(request.qs().razon_social_id)
      const positionId = Number(request.qs().position_id)

      if (!businessUnitId || Number.isNaN(businessUnitId) || !positionId || Number.isNaN(positionId)) {
        response.status(422)
        return {
          type: 'warning',
          title: 'Datos inválidos',
          message: 'Los parámetros razon_social_id y position_id son obligatorios',
          key: 'body-invalido',
        }
      }

      const service = new PositionSalaryRangeService()
      const result = await service.getCurrent(businessUnitId, positionId)

      if (result.status !== 200) {
        const err = result as ServiceError
        response.status(err.status)
        return {
          type: 'warning',
          title: err.title,
          message: err.message,
          key: err.key,
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: 'Rango salarial vigente',
        message: 'El rango salarial vigente fue encontrado correctamente',
        data: { positionSalaryRange: (result as GetCurrentSuccess).range },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ha ocurrido un error inesperado en el servidor',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/position-salary-ranges/{positionSalaryRangeId}:
   *   patch:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Salary Ranges
   *     summary: Editar el rango vigente creando una nueva versión (cierra el anterior)
   *     parameters:
   *       - in: path
   *         name: positionSalaryRangeId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [minSalaryDaily, maxSalaryDaily]
   *             properties:
   *               minSalaryDaily:
   *                 type: number
   *               maxSalaryDaily:
   *                 type: number
   *               validFrom:
   *                 type: string
   *                 format: date
   *               reason:
   *                 type: string
   *     responses:
   *       '200':
   *         description: Nuevo rango creado correctamente
   *       '404':
   *         description: Rango no encontrado
   *       '409':
   *         description: Rango ya cerrado o edición simultánea detectada
   *       '422':
   *         description: Sin cambios / fecha pasada / min mayor max / body inválido
   */
  async update({ request, response, auth }: HttpContext) {
    try {
      const positionSalaryRangeId = Number(request.param('positionSalaryRangeId'))

      if (!positionSalaryRangeId || Number.isNaN(positionSalaryRangeId)) {
        response.status(422)
        return {
          type: 'warning',
          title: 'Datos inválidos',
          message: 'El ID del rango salarial no es válido',
          key: 'body-invalido',
        }
      }

      const data = await request.validateUsing(updatePositionSalaryRangeValidator)

      let validFrom: DateTime | undefined
      if (data.validFrom) {
        validFrom = DateTime.fromJSDate(data.validFrom)
        if (!validFrom.isValid) {
          response.status(422)
          return {
            type: 'warning',
            title: 'Datos inválidos',
            message: 'La fecha de inicio de vigencia no es válida',
            key: 'body-invalido',
          }
        }
      }

      const actorId = auth.user!.userId
      const service = new PositionSalaryRangeService()
      const result = await service.updateVersion(positionSalaryRangeId, {
        minSalaryDaily: data.minSalaryDaily,
        maxSalaryDaily: data.maxSalaryDaily,
        validFrom,
        reason: data.reason,
        actorId,
      })

      if (result.status !== 200) {
        const err = result as ServiceError
        response.status(err.status)
        return {
          type: 'warning',
          title: err.title,
          message: err.message,
          key: err.key,
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: 'Rango salarial actualizado',
        message: 'El rango anterior fue cerrado y se creó un nuevo rango con los valores indicados',
        data: { positionSalaryRange: (result as UpdateVersionSuccess).range },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(422)
      return {
        type: 'error',
        title: 'Datos inválidos',
        message: messageError,
        key: 'body-invalido',
      }
    }
  }

  /**
   * @swagger
   * /api/position-salary-ranges/history:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Salary Ranges
   *     summary: Historial completo de rangos de un puesto (vigente + cerrados)
   *     parameters:
   *       - in: query
   *         name: razon_social_id
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: position_id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Historial de rangos ordenado del más reciente al más antiguo
   *       '422':
   *         description: Parámetros inválidos o referencias inexistentes
   */
  async history({ request, response }: HttpContext) {
    try {
      const businessUnitId = Number(request.qs().razon_social_id)
      const positionId = Number(request.qs().position_id)

      if (!businessUnitId || Number.isNaN(businessUnitId) || !positionId || Number.isNaN(positionId)) {
        response.status(422)
        return {
          type: 'warning',
          title: 'Datos inválidos',
          message: 'Los parámetros razon_social_id y position_id son obligatorios',
          key: 'body-invalido',
        }
      }

      const service = new PositionSalaryRangeService()
      const result = await service.getHistory(businessUnitId, positionId)

      if (result.status !== 200) {
        const err = result as ServiceError
        response.status(err.status)
        return {
          type: 'warning',
          title: err.title,
          message: err.message,
          key: err.key,
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: 'Historial de rangos salariales',
        message: 'Historial de rangos salariales encontrado correctamente',
        data: (result as GetHistorySuccess).data,
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ha ocurrido un error inesperado en el servidor',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/position-salary-ranges/{positionSalaryRangeId}/audit:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Salary Ranges
   *     summary: Registros de auditoría de un rango salarial específico
   *     parameters:
   *       - in: path
   *         name: positionSalaryRangeId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Registros de auditoría con montos descifrados, ordenados del más reciente al más antiguo
   *       '404':
   *         description: Rango no encontrado
   */
  async audit({ request, response }: HttpContext) {
    try {
      const positionSalaryRangeId = Number(request.param('positionSalaryRangeId'))

      if (!positionSalaryRangeId || Number.isNaN(positionSalaryRangeId)) {
        response.status(422)
        return {
          type: 'warning',
          title: 'Datos inválidos',
          message: 'El ID del rango salarial no es válido',
          key: 'body-invalido',
        }
      }

      const service = new PositionSalaryRangeService()
      const result = await service.getAudit(positionSalaryRangeId)

      if (result.status !== 200) {
        const err = result as ServiceError
        response.status(err.status)
        return {
          type: 'warning',
          title: err.title,
          message: err.message,
          key: err.key,
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: 'Auditoría del rango salarial',
        message: 'Registros de auditoría encontrados correctamente',
        data: (result as GetAuditSuccess).data,
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ha ocurrido un error inesperado en el servidor',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/position-salary-ranges/{positionSalaryRangeId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Salary Ranges
   *     summary: Cerrar un rango salarial vigente
   *     parameters:
   *       - in: path
   *         name: positionSalaryRangeId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               reason:
   *                 type: string
   *     responses:
   *       '204':
   *         description: Rango cerrado correctamente
   *       '404':
   *         description: Rango no encontrado
   *       '409':
   *         description: El rango ya estaba cerrado
   */
  async close({ request, response, auth }: HttpContext) {
    try {
      const positionSalaryRangeId = Number(request.param('positionSalaryRangeId'))

      if (!positionSalaryRangeId || Number.isNaN(positionSalaryRangeId)) {
        response.status(422)
        return {
          type: 'warning',
          title: 'Datos inválidos',
          message: 'El ID del rango salarial no es válido',
          key: 'body-invalido',
        }
      }

      const data = await request.validateUsing(closePositionSalaryRangeValidator)
      const actorId = auth.user!.userId

      const service = new PositionSalaryRangeService()
      const result = await service.close(positionSalaryRangeId, actorId, data.reason)

      if (result.status !== 204) {
        const err = result as ServiceError
        response.status(err.status)
        return {
          type: 'warning',
          title: err.title,
          message: err.message,
          key: err.key,
        }
      }

      response.status(204)
      return
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ha ocurrido un error inesperado en el servidor',
        error: messageError,
      }
    }
  }
}
