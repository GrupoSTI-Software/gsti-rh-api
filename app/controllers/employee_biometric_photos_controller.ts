import Employee from '#models/employee'
import EmployeeBiometricFaceIdService from '#services/employee_biometric_face_id_service'
import UploadService from '#services/upload_service'
import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import { ensureEmployeeBiometricRead } from '#helpers/ensure_employee_biometric_read'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'

/**
 * Controlador proxy para servir el binario de la foto biométrica de un empleado
 * descargándolo desde DigitalOcean Spaces y haciendo stream al cliente.
 *
 * Existe porque algunas redes corporativas filtran *.digitaloceanspaces.com.
 * El servidor sí alcanza el bucket y reemite los bytes por el dominio del API.
 */
export default class EmployeeBiometricPhotosController {
  /**
   * @swagger
   * /api/employees/{employeeId}/biometric-face-id-photo:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Biometric Face ID
   *     summary: Descarga la foto biométrica de un empleado (proxy)
   *     description: |
   *       Proxy server-side para la foto biométrica. El API descarga el binario
   *       desde DigitalOcean Spaces y lo reemite al cliente. Pensado para clientes
   *       en redes corporativas que no pueden alcanzar el dominio de Spaces.
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: integer
   *         description: Identificador del empleado
   *     responses:
   *       200:
   *         description: Stream binario de la foto biométrica
   *         headers:
   *           Cache-Control:
   *             schema:
   *               type: string
   *             description: private, max-age=300
   *           ETag:
   *             schema:
   *               type: string
   *           Last-Modified:
   *             schema:
   *               type: string
   *         content:
   *           image/jpeg:
   *             schema:
   *               type: string
   *               format: binary
   *       400:
   *         description: ID de empleado inválido
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                   example: Error de validación
   *                 message:
   *                   type: string
   *       401:
   *         description: Sin token de autenticación válido
   *       404:
   *         description: Empleado no encontrado o sin foto biométrica
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: warning
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *       500:
   *         description: Error inesperado al descargar el archivo
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   */
  @inject()
  async streamPhoto(ctx: HttpContext, uploadService: UploadService) {
    const { request, response, logger } = ctx
    const employeeIdRaw = request.param('employeeId')
    const employeeId = Number(employeeIdRaw)

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      response.status(400)
      return {
        type: 'error',
        title: 'Error de validación',
        message: 'El ID del empleado es inválido',
        data: { employeeId: employeeIdRaw },
      }
    }

    // Aquí se entregan los bytes de la foto, no una URL: es el punto que de
    // verdad hay que cerrar. Solo el dueño pasa sin permiso de administración.
    if (
      !(await ensureEmployeeBiometricRead(
        ctx,
        employeeId,
        EMPLOYEES_READ_PERMISSION_DECLARATIONS.streamBiometricFacePhoto
      ))
    ) {
      return
    }

    const currentEmployee = await Employee.query()
      .where('employee_id', employeeId)
      .whereNull('employee_deleted_at')
      .first()

    if (!currentEmployee) {
      response.status(404)
      return {
        type: 'warning',
        title: 'Empleado no encontrado',
        message: 'El empleado no fue encontrado con el ID proporcionado',
        data: { employeeId },
      }
    }

    const biometricService = new EmployeeBiometricFaceIdService()
    const biometricFaceId = await biometricService.findByEmployeeId(employeeId)

    if (!biometricFaceId || !biometricFaceId.employeeBiometricFaceIdPhotoUrl) {
      response.status(404)
      return {
        type: 'warning',
        title: 'Foto no encontrada',
        message: 'No se encontró una foto biométrica para este empleado',
        data: { employeeId },
      }
    }

    const objectKey = biometricFaceId.employeeBiometricFaceIdPhotoUrl

    try {
      const object = await uploadService.getObjectStream(objectKey)

      if (!object) {
        logger.warn(
          { employeeId, key: objectKey },
          'Foto biométrica registrada en BD pero no encontrada en almacenamiento'
        )
        response.status(404)
        return {
          type: 'warning',
          title: 'Foto no encontrada',
          message: 'No se encontró una foto biométrica para este empleado',
          data: { employeeId },
        }
      }

      response.header('Content-Type', object.contentType || 'image/jpeg')
      response.header('Cache-Control', 'private, max-age=300')
      if (object.contentLength !== undefined) {
        response.header('Content-Length', String(object.contentLength))
      }
      if (object.etag) {
        response.header('ETag', object.etag)
      }
      if (object.lastModified) {
        response.header('Last-Modified', object.lastModified.toUTCString())
      }

      response.status(200)
      return response.stream(object.stream)
    } catch (error: any) {
      logger.error(
        { err: error, employeeId, key: objectKey },
        'Error inesperado al descargar foto biométrica del almacenamiento'
      )
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado al obtener la foto biométrica',
        error: error?.message,
      }
    }
  }
}
