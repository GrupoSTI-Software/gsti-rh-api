import type { HttpContext } from '@adonisjs/core/http'
import EmployeeTeleworkLocationService from '#services/employee_telework_location_service'
import {
  createEmployeeTeleworkLocationValidator,
  updateEmployeeTeleworkLocationValidator,
} from '#validators/employee_telework_location'
import { TWL_ERROR_CODES, type TwlErrorCode } from '#constants/employee_telework_location_error_codes'

/**
 * Controlador del lugar de teletrabajo (NOM-037 5.1 / 5.1.1 / 5.1.2).
 *
 * Ref: USRH1782792802405 — Capturar el lugar de teletrabajo con fijeza y
 * conectividad. Todas las rutas van bajo `auth()` + `businessScope()`;
 * la empresa se resuelve del header `X-Business-Unit-Id` (anti-IDOR).
 */
export default class EmployeeTeleworkLocationController {
  /**
   * Mapea un código de error del dominio a su respuesta HTTP con mensaje
   * localizado, siguiendo el contrato `{ type, title, message, key, code }`.
   */
  private buildErrorResponse(code: TwlErrorCode, i18n: HttpContext['i18n']) {
    switch (code) {
      case TWL_ERROR_CODES.ONLY_TELEWORKERS:
        return {
          status: 422,
          body: {
            type: 'warning',
            title: i18n.formatMessage('telework_location_title'),
            message: i18n.formatMessage('telework_location_only_teleworkers'),
            key: 'solo-teletrabajadores',
            code,
            data: null,
          },
        }
      case TWL_ERROR_CODES.EMPLOYEE_NOT_FOUND:
        return {
          status: 404,
          body: {
            type: 'warning',
            title: i18n.formatMessage('telework_location_title'),
            message: i18n.formatMessage('telework_location_employee_not_found'),
            key: 'empleado-no-encontrado',
            code,
            data: null,
          },
        }
      case TWL_ERROR_CODES.LOCATION_NOT_FOUND:
        return {
          status: 404,
          body: {
            type: 'warning',
            title: i18n.formatMessage('telework_location_title'),
            message: i18n.formatMessage('telework_location_not_found'),
            key: 'lugar-no-encontrado',
            code,
            data: null,
          },
        }
      default:
        return {
          status: 500,
          body: {
            type: 'error',
            title: i18n.formatMessage('telework_location_title'),
            message: i18n.formatMessage('telework_location_unexpected_error'),
            key: 'error-inesperado',
            code: TWL_ERROR_CODES.SYS_UNHANDLED,
            data: null,
          },
        }
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-locations:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - NOM-037 Telework Locations
   *     summary: Lista los lugares de teletrabajo de un empleado
   *     parameters:
   *       - name: employeeId
   *         in: query
   *         required: true
   *         schema:
   *           type: integer
   *       - name: X-Business-Unit-Id
   *         in: header
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Lugares del empleado dentro del tenant
   *       '404':
   *         description: Empleado inexistente o fuera del tenant
   */
  async index({ request, response, i18n, businessUnitScope }: HttpContext) {
    const employeeId = Number(request.qs().employeeId)
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      response.status(400)
      return {
        type: 'warning',
        title: i18n.formatMessage('telework_location_title'),
        message: i18n.formatMessage('telework_location_employee_id_required'),
        key: 'employee-id-requerido',
        code: TWL_ERROR_CODES.VAL_INPUT,
        data: null,
      }
    }

    const service = new EmployeeTeleworkLocationService()
    const result = await service.listByEmployee(employeeId, businessUnitScope ?? [])

    if (!result.ok) {
      const error = this.buildErrorResponse(result.code!, i18n)
      response.status(error.status)
      return error.body
    }

    response.status(200)
    return {
      type: 'success',
      title: i18n.formatMessage('telework_location_title'),
      message: i18n.formatMessage('telework_location_list_success'),
      data: { teleworkLocations: result.locations },
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-locations:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - NOM-037 Telework Locations
   *     summary: Registra un lugar de teletrabajo (gating Remote/Hybrid)
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/EmployeeTeleworkLocation'
   *     responses:
   *       '201':
   *         description: Lugar registrado
   *       '404':
   *         description: Empleado inexistente o fuera del tenant
   *       '422':
   *         description: El empleado no es teletrabajador (code TWL.VAL.GATING.001)
   */
  async store({ request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const payload = await request.validateUsing(createEmployeeTeleworkLocationValidator)
      const service = new EmployeeTeleworkLocationService()
      const result = await service.create(payload.employeeId, payload, businessUnitScope ?? [])

      if (!result.ok) {
        const error = this.buildErrorResponse(result.code!, i18n)
        response.status(error.status)
        return error.body
      }

      response.status(201)
      return {
        type: 'success',
        title: i18n.formatMessage('telework_location_title'),
        message: i18n.formatMessage('telework_location_created'),
        data: { teleworkLocation: result.location },
      }
    } catch (error) {
      if (error?.messages) {
        response.status(400)
        return {
          type: 'warning',
          title: i18n.formatMessage('telework_location_title'),
          message: i18n.formatMessage('telework_location_invalid_input'),
          key: 'input-invalido',
          code: TWL_ERROR_CODES.VAL_INPUT,
          data: { errors: error.messages },
        }
      }
      throw error
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-locations/{id}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - NOM-037 Telework Locations
   *     summary: Actualiza un lugar de teletrabajo del tenant
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Lugar actualizado
   *       '404':
   *         description: Lugar inexistente o fuera del tenant
   */
  async update({ params, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const payload = await request.validateUsing(updateEmployeeTeleworkLocationValidator)
      const service = new EmployeeTeleworkLocationService()
      const result = await service.update(Number(params.id), payload, businessUnitScope ?? [])

      if (!result.ok) {
        const error = this.buildErrorResponse(result.code!, i18n)
        response.status(error.status)
        return error.body
      }

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('telework_location_title'),
        message: i18n.formatMessage('telework_location_updated'),
        data: { teleworkLocation: result.location },
      }
    } catch (error) {
      if (error?.messages) {
        response.status(400)
        return {
          type: 'warning',
          title: i18n.formatMessage('telework_location_title'),
          message: i18n.formatMessage('telework_location_invalid_input'),
          key: 'input-invalido',
          code: TWL_ERROR_CODES.VAL_INPUT,
          data: { errors: error.messages },
        }
      }
      throw error
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-locations/{id}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - NOM-037 Telework Locations
   *     summary: Baja lógica del lugar de teletrabajo (auditoría)
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Lugar dado de baja lógicamente
   *       '404':
   *         description: Lugar inexistente o fuera del tenant
   */
  async destroy({ params, response, i18n, businessUnitScope }: HttpContext) {
    const service = new EmployeeTeleworkLocationService()
    const result = await service.softDelete(Number(params.id), businessUnitScope ?? [])

    if (!result.ok) {
      const error = this.buildErrorResponse(result.code!, i18n)
      response.status(error.status)
      return error.body
    }

    response.status(200)
    return {
      type: 'success',
      title: i18n.formatMessage('telework_location_title'),
      message: i18n.formatMessage('telework_location_deleted'),
      data: { teleworkLocation: result.location },
    }
  }
}
