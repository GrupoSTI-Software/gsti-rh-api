import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import { createEmployeeTemporaryAssignmentValidator } from '#validators/employee_temporary_assignment'
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
   *           - dias-invalidos
   */
  async store({ request, response, params, auth }: HttpContext) {
    try {
      const user = auth.user
      if (!user) {
        return response.status(401).json({
          type: 'error',
          title: 'No autorizado',
          message: 'El usuario debe estar autenticado.',
          data: null,
        })
      }

      const employeeId = Number(params.employeeId)

      const employee = await Employee.query()
        .where('employee_id', employeeId)
        .whereNull('employee_deleted_at')
        .first()

      if (!employee) {
        return response.status(404).json({
          type: 'error',
          title: 'Empleado no encontrado',
          message: 'El empleado solicitado no existe o fue dado de baja.',
          data: null,
        })
      }

      let validatedData: {
        targetBranchId: number
        startDate?: string
        days: number
        shiftOverride?: { startTime: string; endTime: string }
      }

      try {
        validatedData = await request.validateUsing(createEmployeeTemporaryAssignmentValidator)
      } catch (error: any) {
        if (error.code === 'E_VALIDATION_ERROR') {
          return response.status(400).json({
            type: 'error',
            title: 'Datos inválidos',
            message: error.messages?.[0]?.message ?? 'Los datos enviados son inválidos.',
            key: 'body-invalido',
            data: { errors: error.messages },
          })
        }
        throw error
      }

      const startDate =
        validatedData.startDate ??
        DateTime.now().setZone('UTC-6').toFormat('yyyy-MM-dd')

      const result = await EmployeeTemporaryAssignmentService.create(employeeId, {
        targetBranchId: validatedData.targetBranchId,
        startDate,
        days: validatedData.days,
        shiftOverride: validatedData.shiftOverride,
      })

      return response.status(result.status).json({
        type: result.type,
        title: result.title,
        message: result.message,
        ...(result.key ? { key: result.key } : {}),
        data: result.data,
      })
    } catch (error: any) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.status(404).json({
          type: 'error',
          title: 'Recurso no encontrado',
          message: error.message ?? 'El recurso solicitado no fue encontrado.',
          data: null,
        })
      }

      return response.status(500).json({
        type: 'error',
        title: 'Error del servidor',
        message: error.message ?? 'Ocurrió un error inesperado.',
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
  async showActive({ response, params }: HttpContext) {
    try {
      const employeeId = Number(params.employeeId)

      const employee = await Employee.query()
        .where('employee_id', employeeId)
        .whereNull('employee_deleted_at')
        .first()

      if (!employee) {
        return response.status(404).json({
          type: 'error',
          title: 'Empleado no encontrado',
          message: 'El empleado solicitado no existe o fue dado de baja.',
          data: null,
        })
      }

      const assignment = await EmployeeTemporaryAssignmentService.getActiveAssignment(employeeId)

      if (!assignment) {
        return response.status(200).json({
          type: 'success',
          title: 'Sin préstamo activo',
          message: 'El empleado no tiene un préstamo temporal activo en este momento.',
          data: { activeAssignment: null },
        })
      }

      return response.status(200).json({
        type: 'success',
        title: 'Préstamo temporal activo',
        message: 'Se encontró un préstamo temporal activo para el empleado.',
        data: {
          activeAssignment: {
            id: assignment.employeeTemporaryAssignmentId,
            employeeId: assignment.employeeId,
            sourceBranchId: assignment.sourceBranchId,
            targetBranchId: assignment.targetBranchId,
            targetBranch: assignment.targetBranch,
            startDate: assignment.startDate.toFormat('yyyy-MM-dd'),
            endDate: assignment.endDate.toFormat('yyyy-MM-dd'),
            days: assignment.days,
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
        title: 'Error del servidor',
        message: error.message ?? 'Ocurrió un error inesperado.',
        data: null,
      })
    }
  }
}
