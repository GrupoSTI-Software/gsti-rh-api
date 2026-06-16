import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import {
  cancelEmployeeTemporaryAssignmentValidator,
  createEmployeeTemporaryAssignmentValidator,
  listEmployeeTemporaryAssignmentValidator,
  updateEmployeeTemporaryAssignmentValidator,
} from '#validators/employee_temporary_assignment'
import EmployeeTemporaryAssignmentService from '#services/employee_temporary_assignment_service'
import Employee from '#models/employee'

export default class EmployeeTemporaryAssignmentController {
  /**
   * @swagger
   * /api/employees/{employeeId}/temporary-assignments:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Temporary Assignments
   *     summary: Crea un préstamo temporal de sucursal para el empleado
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID del empleado
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - targetBranchId
   *               - days
   *             properties:
   *               targetBranchId:
   *                 type: integer
   *                 description: ID de la sucursal destino (distinta a la actual del empleado)
   *               startDate:
   *                 type: string
   *                 format: date
   *                 description: Fecha de inicio en formato YYYY-MM-DD (default hoy)
   *               days:
   *                 type: integer
   *                 minimum: 1
   *                 description: Duración del préstamo en días
   *               destinationShiftId:
   *                 type: integer
   *                 nullable: true
   *                 description: Turno de destino que aplica para toda la vigencia
   *               reason:
   *                 type: string
   *                 nullable: true
   *                 enum: [cobertura]
   *                 description: Motivo del préstamo temporal
   *               shiftOverride:
   *                 type: object
   *                 description: Ajuste de turno opcional para el día 1 del préstamo
   *                 properties:
   *                   startTime:
   *                     type: string
   *                     example: "06:00"
   *                   endTime:
   *                     type: string
   *                     example: "14:00"
   *     responses:
   *       '201':
   *         description: Préstamo temporal creado correctamente
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
   *       '400':
   *         description: Datos inválidos (días menor a 1, fecha inválida, turno mal formado)
   *       '404':
   *         description: Empleado no encontrado
   *       '409':
   *         description: |
   *           Conflicto de negocio. Posibles keys:
   *           - prestamo-solapado
   *           - conflicto-vacaciones-incapacidad-permiso
   *       '422':
   *         description: |
   *           Error de validación de negocio. Posibles keys:
   *           - sucursal-destino-igual-a-origen
   *           - turno-destino-no-configurado
   */
  async store({ request, response, params, auth, i18n }: HttpContext) {
    try {
      const user = auth.user
      if (!user) {
        return this.unauthorizedResponse(response, i18n)
      }

      const employeeId = Number(params.employeeId)
      const employeeNotFound = await this.ensureEmployeeExists(employeeId, i18n)
      if (employeeNotFound) return response.status(404).json(employeeNotFound)

      let validatedData: {
        targetBranchId: number
        startDate?: string
        days: number
        destinationShiftId?: number
        reason?: string
        shiftOverride?: { startTime: string; endTime: string }
      }

      try {
        validatedData = await request.validateUsing(createEmployeeTemporaryAssignmentValidator)
      } catch (error: any) {
        return this.validationErrorResponse(response, i18n, error)
      }

      const startDate =
        validatedData.startDate ??
        DateTime.now().setZone('UTC-6').toFormat('yyyy-MM-dd')

      const result = await EmployeeTemporaryAssignmentService.create(employeeId, {
        targetBranchId: validatedData.targetBranchId,
        startDate,
        days: validatedData.days,
        destinationShiftId: validatedData.destinationShiftId ?? null,
        reason: validatedData.reason ?? null,
        shiftOverride: validatedData.shiftOverride,
      })

      return this.respondServiceResult(response, i18n, result, 'store')
    } catch (error: any) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.status(404).json({
          type: 'error',
          title: i18n.t(
            'employee_temporary_assignment_resource_not_found_title',
            undefined,
            'Recurso no encontrado'
          ),
          message: i18n.t(
            'employee_temporary_assignment_resource_not_found_message',
            undefined,
            error.message ?? 'El recurso solicitado no fue encontrado.'
          ),
          data: null,
        })
      }

      return response.status(500).json({
        type: 'error',
        title: i18n.t(
          'employee_temporary_assignment_server_error_title',
          undefined,
          'Error del servidor'
        ),
        message: i18n.t(
          'employee_temporary_assignment_server_error_message',
          undefined,
          error.message ?? 'Ocurrió un error inesperado.'
        ),
        data: null,
      })
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/temporary-assignments/active:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Temporary Assignments
   *     summary: Obtiene el préstamo temporal activo del empleado (si existe)
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Préstamo activo encontrado o null si no hay ninguno
   *       '404':
   *         description: Empleado no encontrado
   */
  async showActive({ response, params, i18n }: HttpContext) {
    try {
      const employeeId = Number(params.employeeId)
      const employeeNotFound = await this.ensureEmployeeExists(employeeId, i18n)
      if (employeeNotFound) return response.status(404).json(employeeNotFound)

      const assignment = await EmployeeTemporaryAssignmentService.getActiveAssignment(employeeId)

      if (!assignment) {
        return response.status(200).json({
          type: 'success',
          title: i18n.t(
            'employee_temporary_assignment_without_active_title',
            undefined,
            'Sin préstamo activo'
          ),
          message: i18n.t(
            'employee_temporary_assignment_without_active_message',
            undefined,
            'El empleado no tiene un préstamo temporal activo en este momento.'
          ),
          data: { activeAssignment: null },
        })
      }

      return response.status(200).json({
        type: 'success',
        title: i18n.t(
          'employee_temporary_assignment_active_title',
          undefined,
          'Préstamo temporal activo'
        ),
        message: i18n.t(
          'employee_temporary_assignment_active_message',
          undefined,
          'Se encontró un préstamo temporal activo para el empleado.'
        ),
        data: {
          activeAssignment: {
            id: assignment.employeeTemporaryAssignmentId,
            employeeId: assignment.employeeId,
            sourceBranchId: assignment.sourceBranchId,
            targetBranchId: assignment.targetBranchId,
            targetBranch: assignment.targetBranch,
            startDate: assignment.startDate.toFormat('yyyy-MM-dd'),
            endDate: assignment.endDate.toFormat('yyyy-MM-dd'),
            effectiveEndDate: assignment.cancelledAt
              ? assignment.cancelledAt.minus({ days: 1 }).toFormat('yyyy-MM-dd')
              : assignment.endDate.toFormat('yyyy-MM-dd'),
            days: assignment.days,
            reason: assignment.reason,
            destinationShiftId: assignment.destinationShiftId,
            destinationShift: assignment.destinationShift
              ? {
                  shiftId: assignment.destinationShift.shiftId,
                  shiftName: assignment.destinationShift.shiftName,
                }
              : null,
            cancelledAt: assignment.cancelledAt
              ? assignment.cancelledAt.toFormat('yyyy-MM-dd')
              : null,
            shiftOverride: assignment.shiftOverrideStart
              ? {
                  startTime: assignment.shiftOverrideStart,
                  endTime: assignment.shiftOverrideEnd,
                }
              : null,
          },
        },
      })
    } catch (error: any) {
      return response.status(500).json({
        type: 'error',
        title: i18n.t(
          'employee_temporary_assignment_server_error_title',
          undefined,
          'Error del servidor'
        ),
        message: i18n.t(
          'employee_temporary_assignment_server_error_message',
          undefined,
          error.message ?? 'Ocurrió un error inesperado.'
        ),
        data: null,
      })
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/temporary-assignments:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Temporary Assignments
   *     summary: Lista el historial de préstamos temporales del empleado
   */
  async index({ request, response, params, i18n }: HttpContext) {
    try {
      const employeeId = Number(params.employeeId)
      const employeeNotFound = await this.ensureEmployeeExists(employeeId, i18n)
      if (employeeNotFound) return response.status(404).json(employeeNotFound)

      let query: { from?: string; to?: string }
      try {
        query = await request.validateUsing(listEmployeeTemporaryAssignmentValidator, {
          data: request.qs(),
        })
      } catch (error: any) {
        return this.validationErrorResponse(response, i18n, error)
      }

      const result = await EmployeeTemporaryAssignmentService.list(employeeId, query)
      return this.respondServiceResult(response, i18n, result, 'index')
    } catch (error: any) {
      return response.status(500).json({
        type: 'error',
        title: i18n.t(
          'employee_temporary_assignment_server_error_title',
          undefined,
          'Error del servidor'
        ),
        message: i18n.t(
          'employee_temporary_assignment_server_error_message',
          undefined,
          error.message ?? 'Ocurrió un error inesperado.'
        ),
        data: null,
      })
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/temporary-assignments/{id}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Temporary Assignments
   *     summary: Edita un préstamo temporal del empleado
   */
  async update({ request, response, params, i18n }: HttpContext) {
    try {
      const employeeId = Number(params.employeeId)
      const id = Number(params.id)
      const employeeNotFound = await this.ensureEmployeeExists(employeeId, i18n)
      if (employeeNotFound) return response.status(404).json(employeeNotFound)

      let validatedData: {
        startDate?: string
        days?: number
        destinationShiftId?: number
        reason?: string | null
      }

      try {
        validatedData = await request.validateUsing(updateEmployeeTemporaryAssignmentValidator)
      } catch (error: any) {
        return this.validationErrorResponse(response, i18n, error)
      }

      const result = await EmployeeTemporaryAssignmentService.update(employeeId, id, validatedData)
      return this.respondServiceResult(response, i18n, result, 'update')
    } catch (error: any) {
      return response.status(500).json({
        type: 'error',
        title: i18n.t(
          'employee_temporary_assignment_server_error_title',
          undefined,
          'Error del servidor'
        ),
        message: i18n.t(
          'employee_temporary_assignment_server_error_message',
          undefined,
          error.message ?? 'Ocurrió un error inesperado.'
        ),
        data: null,
      })
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/temporary-assignments/{id}/cancel:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Temporary Assignments
   *     summary: Cancela anticipadamente un préstamo temporal
   */
  async cancel({ request, response, params, i18n }: HttpContext) {
    try {
      const employeeId = Number(params.employeeId)
      const id = Number(params.id)
      const employeeNotFound = await this.ensureEmployeeExists(employeeId, i18n)
      if (employeeNotFound) return response.status(404).json(employeeNotFound)

      let validatedData: { cancelDate?: string }
      try {
        validatedData = await request.validateUsing(cancelEmployeeTemporaryAssignmentValidator)
      } catch (error: any) {
        return this.validationErrorResponse(response, i18n, error)
      }

      const cancelDate =
        validatedData.cancelDate ?? DateTime.now().setZone('UTC-6').toFormat('yyyy-MM-dd')

      const result = await EmployeeTemporaryAssignmentService.cancel(employeeId, id, { cancelDate })
      return this.respondServiceResult(response, i18n, result, 'cancel')
    } catch (error: any) {
      return response.status(500).json({
        type: 'error',
        title: i18n.t(
          'employee_temporary_assignment_server_error_title',
          undefined,
          'Error del servidor'
        ),
        message: i18n.t(
          'employee_temporary_assignment_server_error_message',
          undefined,
          error.message ?? 'Ocurrió un error inesperado.'
        ),
        data: null,
      })
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/temporary-assignments/{id}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Temporary Assignments
   *     summary: Elimina lógicamente un préstamo temporal
   */
  async destroy({ response, params, i18n }: HttpContext) {
    try {
      const employeeId = Number(params.employeeId)
      const id = Number(params.id)
      const employeeNotFound = await this.ensureEmployeeExists(employeeId, i18n)
      if (employeeNotFound) return response.status(404).json(employeeNotFound)

      const result = await EmployeeTemporaryAssignmentService.destroy(employeeId, id)
      return this.respondServiceResult(response, i18n, result, 'destroy')
    } catch (error: any) {
      return response.status(500).json({
        type: 'error',
        title: i18n.t(
          'employee_temporary_assignment_server_error_title',
          undefined,
          'Error del servidor'
        ),
        message: i18n.t(
          'employee_temporary_assignment_server_error_message',
          undefined,
          error.message ?? 'Ocurrió un error inesperado.'
        ),
        data: null,
      })
    }
  }

  private async ensureEmployeeExists(employeeId: number, i18n: HttpContext['i18n']) {
    const employee = await Employee.query()
      .where('employee_id', employeeId)
      .whereNull('employee_deleted_at')
      .first()

    if (employee) return null

    return {
      type: 'error',
      title: i18n.t(
        'employee_temporary_assignment_employee_not_found_title',
        undefined,
        'Empleado no encontrado'
      ),
      message: i18n.t(
        'employee_temporary_assignment_employee_not_found_message',
        undefined,
        'El empleado solicitado no existe o fue dado de baja.'
      ),
      key: 'empleado-no-encontrado',
      data: null,
    }
  }

  private validationErrorResponse(
    response: HttpContext['response'],
    i18n: HttpContext['i18n'],
    error: any
  ) {
    if (error.code !== 'E_VALIDATION_ERROR') throw error
    return response.status(400).json({
      type: 'error',
      title: i18n.t(
        'employee_temporary_assignment_invalid_body_title',
        undefined,
        'Datos inválidos'
      ),
      message: error.messages?.[0]?.message ?? i18n.t(
        'employee_temporary_assignment_invalid_body_message',
        undefined,
        'Los datos enviados son inválidos.'
      ),
      key: 'body-invalido',
      data: { errors: error.messages },
    })
  }

  private resolveResultText(
    i18n: HttpContext['i18n'],
    key: string | null | undefined,
    action: 'store' | 'index' | 'update' | 'cancel' | 'destroy',
    type: string,
    fallbackTitle: string,
    fallbackMessage: string
  ) {
    if (key === 'prestamo-solapado') {
      return {
        title: i18n.t(
          'employee_temporary_assignment_overlap_title',
          undefined,
          'Préstamo solapado'
        ),
        message: i18n.t(
          'employee_temporary_assignment_overlap_message',
          undefined,
          fallbackMessage
        ),
      }
    }
    if (key === 'conflicto-vacaciones-incapacidad-permiso') {
      return {
        title: i18n.t(
          'employee_temporary_assignment_conflict_exception_title',
          undefined,
          'Conflicto con ausencias registradas'
        ),
        message: i18n.t(
          'employee_temporary_assignment_conflict_exception_message',
          undefined,
          fallbackMessage
        ),
      }
    }
    if (key === 'turno-destino-no-configurado') {
      return {
        title: i18n.t(
          'employee_temporary_assignment_destination_shift_not_configured_title',
          undefined,
          'Turno destino no configurado'
        ),
        message: i18n.t(
          'employee_temporary_assignment_destination_shift_not_configured_message',
          undefined,
          'El turno destino no está configurado para el sitio destino.'
        ),
      }
    }
    if (key === 'prestamo-no-editable') {
      return {
        title: i18n.t(
          'employee_temporary_assignment_not_editable_title',
          undefined,
          'Préstamo no editable'
        ),
        message: i18n.t(
          'employee_temporary_assignment_not_editable_message',
          undefined,
          fallbackMessage
        ),
      }
    }
    if (key === 'prestamo-no-encontrado') {
      return {
        title: i18n.t(
          'employee_temporary_assignment_not_found_title',
          undefined,
          'Préstamo no encontrado'
        ),
        message: i18n.t(
          'employee_temporary_assignment_not_found_message',
          undefined,
          'No se encontró el préstamo temporal solicitado.'
        ),
      }
    }
    if (key === 'sucursal-destino-igual-a-origen') {
      return {
        title: i18n.t(
          'employee_temporary_assignment_target_branch_invalid_title',
          undefined,
          'Sucursal destino inválida'
        ),
        message: i18n.t(
          'employee_temporary_assignment_target_branch_invalid_message',
          undefined,
          'La sucursal destino debe ser distinta a la sucursal habitual del empleado.'
        ),
      }
    }
    if (key === 'sucursal-destino-no-encontrada') {
      return {
        title: i18n.t(
          'employee_temporary_assignment_target_branch_not_found_title',
          undefined,
          'Sucursal destino no encontrada'
        ),
        message: i18n.t(
          'employee_temporary_assignment_target_branch_not_found_message',
          undefined,
          'La sucursal destino no existe o fue eliminada.'
        ),
      }
    }
    if (key === 'sin-sucursal-origen') {
      return {
        title: i18n.t(
          'employee_temporary_assignment_source_branch_missing_title',
          undefined,
          'Sin sucursal asignada'
        ),
        message: i18n.t(
          'employee_temporary_assignment_source_branch_missing_message',
          undefined,
          'El empleado no tiene una sucursal activa asignada.'
        ),
      }
    }
    if (key === 'dias-invalidos') {
      return {
        title: i18n.t(
          'employee_temporary_assignment_invalid_days_title',
          undefined,
          'Datos inválidos'
        ),
        message: i18n.t(
          'employee_temporary_assignment_invalid_days_message',
          undefined,
          'El número de días debe ser mínimo 1.'
        ),
      }
    }
    if (key === 'body-invalido') {
      return {
        title: i18n.t(
          'employee_temporary_assignment_invalid_body_title',
          undefined,
          'Datos inválidos'
        ),
        message: i18n.t(
          'employee_temporary_assignment_invalid_body_message',
          undefined,
          fallbackMessage
        ),
      }
    }

    if (type !== 'success') {
      return { title: fallbackTitle, message: fallbackMessage }
    }

    if (action === 'store') {
      return {
        title: i18n.t(
          'employee_temporary_assignment_created_title',
          undefined,
          'Préstamo temporal creado'
        ),
        message: i18n.t(
          'employee_temporary_assignment_created_message',
          undefined,
          'El préstamo temporal fue registrado correctamente.'
        ),
      }
    }
    if (action === 'update') {
      return {
        title: i18n.t(
          'employee_temporary_assignment_updated_title',
          undefined,
          'Préstamo temporal actualizado'
        ),
        message: i18n.t(
          'employee_temporary_assignment_updated_message',
          undefined,
          'El préstamo temporal fue actualizado correctamente.'
        ),
      }
    }
    if (action === 'cancel') {
      return {
        title: i18n.t(
          'employee_temporary_assignment_cancelled_title',
          undefined,
          'Préstamo temporal cancelado'
        ),
        message: i18n.t(
          'employee_temporary_assignment_cancelled_message',
          undefined,
          'El préstamo temporal fue cancelado correctamente.'
        ),
      }
    }
    if (action === 'index') {
      return {
        title: i18n.t(
          'employee_temporary_assignment_index_title',
          undefined,
          'Historial de préstamos'
        ),
        message: i18n.t(
          'employee_temporary_assignment_index_message',
          undefined,
          'Historial de préstamos obtenido correctamente.'
        ),
      }
    }
    if (action === 'destroy') {
      return {
        title: i18n.t(
          'employee_temporary_assignment_deleted_title',
          undefined,
          'Préstamo temporal eliminado'
        ),
        message: i18n.t(
          'employee_temporary_assignment_deleted_message',
          undefined,
          'El préstamo temporal fue eliminado correctamente.'
        ),
      }
    }

    return { title: fallbackTitle, message: fallbackMessage }
  }

  private respondServiceResult(
    response: HttpContext['response'],
    i18n: HttpContext['i18n'],
    result: {
      status: number
      type: string
      title: string
      message: string
      key?: string | null
      data: any
    },
    action: 'store' | 'index' | 'update' | 'cancel' | 'destroy'
  ) {
    const localized = this.resolveResultText(
      i18n,
      result.key,
      action,
      result.type,
      result.title,
      result.message
    )

    return response.status(result.status).json({
      type: result.type,
      title: localized.title,
      message: localized.message,
      ...(result.key ? { key: result.key } : {}),
      data: result.data,
    })
  }

  private unauthorizedResponse(response: HttpContext['response'], i18n: HttpContext['i18n']) {
    return response.status(401).json({
      type: 'error',
      title: i18n.t('employee_temporary_assignment_unauthorized_title', undefined, 'No autorizado'),
      message: i18n.t(
        'employee_temporary_assignment_unauthorized_message',
        undefined,
        'El usuario debe estar autenticado.'
      ),
      data: null,
    })
  }
}
