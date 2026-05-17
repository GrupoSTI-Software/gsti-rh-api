import type { HttpContext } from '@adonisjs/core/http'
import EmployeeCertificationExpirationService from '#services/employee_certification_expiration_service'
import { employeeCertificationListValidator } from '#validators/employee_certification_list'

export default class EmployeeCertificationExpirationController {
  /**
   * @swagger
   * /api/employee-certifications/get-expired-and-expiring:
   *   get:
   *     summary: Obtener certificaciones de empleados vencidas y por vencer (próximos 30 días)
   *     description: |
   *       Cruza employee_certifications con certifications y employees.
   *       Por cada par (employee_id, certification_id) toma solo el cumplimiento más reciente
   *       no borrado. Filtra por employee_certification_expires_at entre hoy y hoy+30 días.
   *       Certificaciones sin renewal_period_days (sin expiración) nunca aparecen.
   *       Ordenado por daysToExpire ascendente (más urgentes primero).
   *     tags: [EmployeeCertificationExpirations]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Lista de certificaciones por vencer
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
   *                     employeeCertificationExpirations:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           employeeCertificationId: { type: integer }
   *                           employee:
   *                             type: object
   *                             properties:
   *                               employeeId: { type: integer }
   *                               fullName: { type: string }
   *                               employeeCode: { type: string }
   *                               positionName: { type: string, nullable: true }
   *                           certification:
   *                             type: object
   *                             properties:
   *                               certificationId: { type: integer }
   *                               name: { type: string }
   *                               category:
   *                                 type: object
   *                                 nullable: true
   *                                 properties:
   *                                   id: { type: integer }
   *                                   name: { type: string }
   *                           compliedAt: { type: string, format: date }
   *                           expiresAt: { type: string, format: date }
   *                           daysToExpire: { type: integer }
   *       '500':
   *         description: Error inesperado del servidor
   */
  /**
   * @swagger
   * /api/employee-certifications:
   *   get:
   *     summary: Listado paginado de todos los cumplimientos de certificación
   *     description: |
   *       Devuelve todos los cumplimientos activos (no borrados) de certificaciones
   *       de empleados, ordenados por fecha de vencimiento ascendente (sin vencimiento al final),
   *       luego por fecha de cumplimiento descendente.
   *       Filtros opcionales: employeeId, certificationId, categoryId.
   *     tags: [EmployeeCertificationExpirations]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 25, maximum: 500 }
   *       - in: query
   *         name: employeeId
   *         schema: { type: integer }
   *       - in: query
   *         name: certificationId
   *         schema: { type: integer }
   *       - in: query
   *         name: categoryId
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Lista paginada de cumplimientos
   */
  async index({ request, response }: HttpContext) {
    try {
      const filters = await request.validateUsing(employeeCertificationListValidator)
      const service = new EmployeeCertificationExpirationService()
      const bundle = await service.listPaginated(
        filters.page ?? 1,
        filters.limit ?? 25,
        {
          employeeId: filters.employeeId,
          certificationId: filters.certificationId,
          categoryId: filters.categoryId,
        }
      )

      return response.status(200).json({
        type: 'success',
        title: 'Employee certifications',
        message: 'Employee certifications found successfully',
        data: {
          meta: bundle.meta,
          employeeCertifications: bundle.data,
        },
      })
    } catch (error) {
      const err = error as { message?: string; code?: string; messages?: any[] }
      const message =
        err?.code === 'E_VALIDATION_ERROR'
          ? err.messages?.[0]?.message ?? 'Error de validación'
          : (err?.message ?? 'Error inesperado')
      return response.status(err?.code === 'E_VALIDATION_ERROR' ? 400 : 500).json({
        type: 'error',
        title: 'Error',
        message,
        data: null,
      })
    }
  }

  async getExpiresAndExpiring({ response }: HttpContext) {
    try {
      const service = new EmployeeCertificationExpirationService()
      const expirations = await service.getExpiredAndExpiring()

      return response.status(200).json({
        type: 'success',
        title: 'Employee certification expirations',
        message: 'The employee certification expirations were found successfully',
        data: { employeeCertificationExpirations: expirations },
      })
    } catch (error) {
      const err = error as { message?: string }
      return response.status(500).json({
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: err?.message ?? 'Unknown error',
      })
    }
  }
}
