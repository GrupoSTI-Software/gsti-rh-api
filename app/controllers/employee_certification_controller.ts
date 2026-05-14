import type { HttpContext } from '@adonisjs/core/http'
import EmployeeCertificationService from '#services/employee_certification_service'
import { EmployeeCertificationError } from '../exceptions/employee_certification_error.js'
import { EC_ERROR_CODES } from '../constants/employee_certification_error_codes.js'

export default class EmployeeCertificationController {
  /**
   * @swagger
   * /api/employees/{employeeId}/certifications:
   *   get:
   *     summary: Listar certificaciones del empleado con estado calculado
   *     description: |
   *       Cruza certificaciones requeridas por el puesto actual del empleado,
   *       cumplimientos históricos y catálogo. Devuelve una fila por certificación
   *       con estado calculado y ordenado por urgencia descendente.
   *       Estados: no_iniciada | vigente | por_vencer | vencida | sin_renovacion | historico
   *     tags: [EmployeeCertifications]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema: { type: integer }
   *         description: ID del empleado
   *     responses:
   *       '200':
   *         description: Lista de certificaciones con estado calculado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type: { type: string }
   *                 title: { type: string }
   *                 message: { type: string }
   *                 data:
   *                   type: object
   *                   properties:
   *                     hasPosition: { type: boolean }
   *                     employeeCertifications:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           certificationId: { type: integer }
   *                           name: { type: string }
   *                           category:
   *                             type: object
   *                             nullable: true
   *                             properties:
   *                               id: { type: integer }
   *                               name: { type: string }
   *                           isExternal: { type: boolean }
   *                           externalUrl: { type: string, nullable: true }
   *                           renewalPeriodDays: { type: integer, nullable: true }
   *                           isRequiredByCurrentPosition: { type: boolean }
   *                           status:
   *                             type: string
   *                             enum: [no_iniciada, vigente, por_vencer, vencida, sin_renovacion, historico]
   *                           lastCompliedAt: { type: string, format: date, nullable: true }
   *                           expiresAt: { type: string, format: date, nullable: true }
   *                           daysToExpire: { type: integer, nullable: true }
   *       '404':
   *         description: Empleado no encontrado
   */
  async index({ params, response }: HttpContext) {
    try {
      const employeeId = Number(params.employeeId)

      if (Number.isNaN(employeeId) || employeeId <= 0) {
        throw new EmployeeCertificationError(
          'El identificador de empleado es inválido.',
          EC_ERROR_CODES.VAL_INPUT,
          400
        )
      }

      const service = new EmployeeCertificationService()
      const { rows, hasPosition } = await service.getForEmployee(employeeId)

      return response.status(200).json({
        type: 'success',
        title: 'Certificaciones del empleado',
        message: 'Certificaciones obtenidas correctamente',
        data: {
          hasPosition,
          employeeCertifications: rows,
        },
      })
    } catch (error) {
      if (error instanceof EmployeeCertificationError) {
        return response.status(error.httpStatus).json({
          type: 'error',
          title: 'Error',
          message: error.message,
          errorCode: error.errorCode,
          data: null,
        })
      }

      const err = error as { message?: string }
      return response.status(500).json({
        type: 'error',
        title: 'Error',
        message: err?.message ?? 'Error inesperado',
        errorCode: EC_ERROR_CODES.SYS_UNHANDLED,
        data: null,
      })
    }
  }
}
