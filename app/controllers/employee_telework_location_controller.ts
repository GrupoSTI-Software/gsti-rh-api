import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import EmployeeTeleworkLocationService from '#services/employee_telework_location_service'
import {
  createEmployeeTeleworkLocationValidator,
  updateEmployeeTeleworkLocationValidator,
} from '#validators/employee_telework_location'
import { TWL_ERROR_CODES, type TwlErrorCode } from '#constants/employee_telework_location_error_codes'

/**
 * Contexto del log de una falla inesperada. Solo ids y el nombre del error:
 * el domicilio es dato personal (LFPDPPP) y `err.message` puede citar valores de
 * la dirección, así que ninguno se registra. El id que la petición no conoce de
 * antemano (`employeeId` en `update`/`destroy`) viaja como `null` para que la
 * forma del log sea la misma en los tres métodos.
 */
interface UnexpectedFailureContext {
  employeeId?: number | null
  locationId?: number | null
  businessUnitId?: number | null
}

/**
 * Controlador del lugar de teletrabajo (NOM-037 5.1 / 5.1.1 / 5.1.2).
 *
 * Ref: USRH1782792802405 — Capturar el lugar de teletrabajo con fijeza y
 * conectividad. Todas las rutas van bajo `auth()` + `businessScope()`;
 * la empresa se resuelve del header `X-Business-Unit-Id` (anti-IDOR).
 *
 * Ref: VLRH-H1791306078668 — Guardar un lugar puede invalidar la lista de
 * verificación vigente. Las tres operaciones responden
 * `data.teleworkChecklistInvalidated` (booleano, siempre presente en el éxito y
 * nunca en los errores) y cualquier falla dentro de la transacción responde 500
 * `error-inesperado` (`TWL.SYS.001`) con un log de solo ids.
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
   * Registra una falla inesperada de `store`/`update`/`destroy` con ids y el
   * nombre del error, jamás el payload, el domicilio ni `err.message`.
   */
  private logUnexpectedFailure(context: UnexpectedFailureContext, error: unknown): void {
    logger.error(
      {
        employeeId: context.employeeId ?? null,
        locationId: context.locationId ?? null,
        businessUnitId: context.businessUnitId ?? null,
        errorName: error instanceof Error ? error.name : 'desconocido',
      },
      'Falla inesperada al guardar el lugar de teletrabajo'
    )
  }

  /**
   * Respuesta viva del 500 (`default` de `buildErrorResponse`: `error-inesperado`
   * con `TWL.SYS.001`). El `trx` del servicio ya revirtió lugar, fijos y lista.
   */
  private respondUnexpectedFailure(response: HttpContext['response'], i18n: HttpContext['i18n']) {
    const failure = this.buildErrorResponse(TWL_ERROR_CODES.SYS_UNHANDLED, i18n)
    response.status(failure.status)
    return failure.body
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     teleworkLocation:
   *                       $ref: '#/components/schemas/EmployeeTeleworkLocation'
   *                     teleworkChecklistInvalidated:
   *                       type: boolean
   *                       description: >-
   *                         `true` solo si esta petición pasó la lista de
   *                         verificación vigente del colaborador de `vigente` a
   *                         `invalidada`. Siempre presente en el 201.
   *       '400':
   *         description: Payload inválido (code TWL.VAL.001)
   *       '404':
   *         description: Empleado inexistente o fuera del tenant (code TWL.NF.EMP.001)
   *       '422':
   *         description: El empleado no es teletrabajador (code TWL.VAL.GATING.001)
   *       '500':
   *         description: >-
   *           Falla inesperada dentro de la transacción; el lugar no se guarda y
   *           RH recibe `error-inesperado` con `TWL.SYS.001`
   */
  async store({ request, response, i18n, businessUnitScope, auth }: HttpContext) {
    let employeeId: number | undefined

    try {
      const payload = await request.validateUsing(createEmployeeTeleworkLocationValidator)
      employeeId = payload.employeeId
      const service = new EmployeeTeleworkLocationService()
      const result = await service.create(
        payload.employeeId,
        payload,
        businessUnitScope ?? [],
        auth.user!.userId
      )

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
        data: {
          teleworkLocation: result.location,
          teleworkChecklistInvalidated: result.teleworkChecklistInvalidated,
        },
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
      this.logUnexpectedFailure({ employeeId, businessUnitId: businessUnitScope?.[0] }, error)
      return this.respondUnexpectedFailure(response, i18n)
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     teleworkLocation:
   *                       $ref: '#/components/schemas/EmployeeTeleworkLocation'
   *                     teleworkChecklistInvalidated:
   *                       type: boolean
   *                       description: >-
   *                         `true` solo si esta petición pasó la lista de
   *                         verificación vigente del colaborador de `vigente` a
   *                         `invalidada`. Siempre presente en el 200.
   *       '400':
   *         description: Payload inválido (code TWL.VAL.001)
   *       '404':
   *         description: Lugar inexistente o fuera del tenant (code TWL.NF.LOC.001)
   *       '500':
   *         description: >-
   *           Falla inesperada dentro de la transacción; el lugar y la lista
   *           revierten y RH recibe `error-inesperado` con `TWL.SYS.001`
   */
  async update({ params, request, response, i18n, businessUnitScope, auth }: HttpContext) {
    const locationId = Number(params.id)

    try {
      const payload = await request.validateUsing(updateEmployeeTeleworkLocationValidator)
      const service = new EmployeeTeleworkLocationService()
      const result = await service.update(
        locationId,
        payload,
        businessUnitScope ?? [],
        auth.user!.userId
      )

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
        data: {
          teleworkLocation: result.location,
          teleworkChecklistInvalidated: result.teleworkChecklistInvalidated,
        },
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
      this.logUnexpectedFailure({ locationId, businessUnitId: businessUnitScope?.[0] }, error)
      return this.respondUnexpectedFailure(response, i18n)
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     teleworkLocation:
   *                       $ref: '#/components/schemas/EmployeeTeleworkLocation'
   *                     teleworkChecklistInvalidated:
   *                       type: boolean
   *                       description: >-
   *                         `true` solo si esta petición pasó la lista de
   *                         verificación vigente del colaborador de `vigente` a
   *                         `invalidada`. Siempre presente en el 200.
   *       '404':
   *         description: Lugar inexistente, ajeno o ya dado de baja (code TWL.NF.LOC.001)
   *       '500':
   *         description: >-
   *           Falla inesperada dentro de la transacción; el lugar y la lista
   *           revierten y RH recibe `error-inesperado` con `TWL.SYS.001`
   */
  async destroy({ params, response, i18n, businessUnitScope, auth }: HttpContext) {
    const locationId = Number(params.id)

    try {
      const service = new EmployeeTeleworkLocationService()
      const result = await service.softDelete(
        locationId,
        businessUnitScope ?? [],
        auth.user!.userId
      )

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
        data: {
          teleworkLocation: result.location,
          teleworkChecklistInvalidated: result.teleworkChecklistInvalidated,
        },
      }
    } catch (error) {
      this.logUnexpectedFailure({ locationId, businessUnitId: businessUnitScope?.[0] }, error)
      return this.respondUnexpectedFailure(response, i18n)
    }
  }
}
