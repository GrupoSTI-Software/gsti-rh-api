import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { respondAdmsApiError } from '#helpers/adms_api_error'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import {
  ensureAccessPointPermission,
  resolveScopedAccessPoint,
  resolveScopedEmployee,
} from '#modules/access-point/access_point_authorization'
import Employee from '#models/employee'
import AccessPointEmployee from '#models/access_point_employee'
import { ACCESS_POINT_PERMISSION_DECLARATIONS } from '#constants/access_point_permission_declarations'
import EmployeeSyncService from './employee_sync.service.js'
import { toEmployeeSyncDto } from './dto/employee_sync.dto.js'

const pairValidator = vine.compile(
  vine.object({
    params: vine.object({
      accessPointId: vine.number().positive(),
      employeeId: vine.number().positive(),
    }),
  })
)

const accessPointValidator = vine.compile(
  vine.object({ params: vine.object({ accessPointId: vine.number().positive() }) })
)

const pinValidator = vine.compile(
  vine.object({
    params: vine.object({
      accessPointId: vine.number().positive(),
      employeeId: vine.number().positive(),
    }),
    pin: vine.string().trim().regex(/^\d{1,9}$/),
  })
)

/**
 * Alta, PIN y revocacion de un colaborador en un checador (spec ADMS 8).
 * Permiso: el de biometricos del colaborador, porque la operacion es sobre la
 * persona, no sobre el catalogo de equipos.
 */
export default class EmployeeSyncController {
  /**
   * @swagger
   * /api/access-points/{accessPointId}/employee/{employeeId}/pin:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Fija o cambia el PIN del colaborador en el checador
   *     responses:
   *       200:
   *         description: Pivote actualizado en data.accessPointEmployee
   *       409:
   *         description: El PIN ya esta ocupado o en cuarentena (key pin-ocupado)
   */
  async setPin(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(
        ctx,
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.assignEmployeeAccessPoint
      )
      const payload = await request.validateUsing(pinValidator, {
        data: { params: request.params(), pin: request.input('pin') },
      })
      const accessPoint = await resolveScopedAccessPoint(ctx, payload.params.accessPointId)
      await resolveScopedEmployee(ctx, payload.params.employeeId)

      const service = new EmployeeSyncService()
      const pivot = await service.setPin({
        accessPointId: accessPoint.accessPointId,
        businessUnitId: accessPoint.businessUnitId,
        employeeId: payload.params.employeeId,
        pin: payload.pin,
        actor: { userId: auth.user?.userId ?? null },
      })

      return StandardResponseFormatter.success(
        response,
        toEmployeeSyncDto(pivot),
        i18n.formatMessage('access_point_employee_title'),
        i18n.formatMessage('employee_sync_pin_message'),
        200,
        'accessPointEmployee'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/v1/access-points/{accessPointId}/employees:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Colaboradores dados de alta en el checador
   *     responses:
   *       200:
   *         description: Lista en data.employees
   *       404:
   *         description: El equipo no esta en el alcance
   */
  async listByAccessPoint(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.readHealth)
      const { params } = await request.validateUsing(accessPointValidator, {
        data: { params: request.params() },
      })
      const accessPoint = await resolveScopedAccessPoint(ctx, params.accessPointId)

      const status = request.input('status')
      const query = AccessPointEmployee.query().where(
        'access_point_id',
        accessPoint.accessPointId
      )
      if (typeof status === 'string' && status.length > 0) {
        query.where('access_point_employee_sync_status', status)
      }
      const pivots = await query.orderBy('access_point_employee_pin', 'asc').limit(500)

      return StandardResponseFormatter.success(
        response,
        pivots.map(toEmployeeSyncDto),
        i18n.formatMessage('access_point_employee_title'),
        i18n.formatMessage('access_point_employee_list_message'),
        200,
        'employees'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/access-points/{accessPointId}/employee/{employeeId}/send:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Encola el alta del colaborador en el checador
   *     responses:
   *       200:
   *         description: Pivote en data.accessPointEmployee
   *       422:
   *         description: El colaborador no tiene PIN (key pin-faltante)
   */
  async send(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(
        ctx,
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.assignEmployeeAccessPoint
      )
      const { params } = await request.validateUsing(pairValidator, {
        data: { params: request.params() },
      })
      const accessPoint = await resolveScopedAccessPoint(ctx, params.accessPointId)
      const employee = await resolveScopedEmployee(ctx, params.employeeId)

      const service = new EmployeeSyncService()
      const pivot = await service.send({
        accessPointId: accessPoint.accessPointId,
        businessUnitId: accessPoint.businessUnitId,
        employeeId: employee.employeeId,
        employeeName: nameOf(employee),
        actor: { userId: auth.user?.userId ?? null },
      })

      return StandardResponseFormatter.success(
        response,
        toEmployeeSyncDto(pivot),
        i18n.formatMessage('access_point_employee_title'),
        i18n.formatMessage('employee_sync_send_message'),
        200,
        'accessPointEmployee'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/access-points/{accessPointId}/employee/{employeeId}/revoke:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Pide el borrado del colaborador en el checador
   *     description: >
   *       Responde 202 porque la baja en el equipo no es inmediata: se encola y
   *       el PIN queda en cuarentena hasta que el aparato confirme.
   *     responses:
   *       202:
   *         description: Revocacion en curso en data.accessPointEmployee
   */
  async revoke(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(
        ctx,
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.removeEmployeeAccessPoint
      )
      const { params } = await request.validateUsing(pairValidator, {
        data: { params: request.params() },
      })
      const accessPoint = await resolveScopedAccessPoint(ctx, params.accessPointId)
      await resolveScopedEmployee(ctx, params.employeeId)

      const service = new EmployeeSyncService()
      const pivot = await service.revoke({
        accessPointId: accessPoint.accessPointId,
        businessUnitId: accessPoint.businessUnitId,
        employeeId: params.employeeId,
        actor: { userId: auth.user?.userId ?? null },
      })

      return StandardResponseFormatter.success(
        response,
        toEmployeeSyncDto(pivot),
        i18n.formatMessage('access_point_employee_title'),
        i18n.formatMessage('employee_sync_revoke_message'),
        202,
        'accessPointEmployee'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /** Un colaborador de otra empresa se comporta como inexistente. */
}

/** Nombre para la pantalla del equipo. El formateador lo recorta a 24. */
function nameOf(employee: Employee): string {
  return [employee.employeeFirstName, employee.employeeLastName]
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join(' ')
    .trim()
}
