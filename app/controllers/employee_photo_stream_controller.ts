import type { HttpContext } from '@adonisjs/core/http'
import Employee from '#models/employee'
import StoredFileStreamService from '#services/stored_file_stream_service'

/**
 * Salida de la foto de perfil de un empleado.
 *
 * Reemplaza a `GET /api/proxy-image`, que era pública, recibía una URL
 * arbitraria por query param y hacía que el servidor la fuera a buscar. Aquí el
 * cliente pide un empleado; la referencia del archivo la resuelve el servidor
 * desde el propio registro y nunca viaja en la petición.
 *
 * La foto se guarda como objeto privado desde el endurecimiento de la subida,
 * así que este endpoint es la forma de mostrarla en el backoffice y en la app.
 */
export default class EmployeePhotoStreamController {
  /**
   * @swagger
   * /api/employees/{employeeId}/photo:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Foto de perfil del empleado
   *     description: |
   *       Entrega el binario de la foto del empleado. La clave del objeto se
   *       resuelve desde el registro; el cliente nunca envía rutas de
   *       almacenamiento.
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Binario de la imagen
   *         content:
   *           image/jpeg:
   *             schema:
   *               type: string
   *               format: binary
   *       400:
   *         description: Identificador inválido
   *       404:
   *         description: El empleado no existe o no tiene foto
   */
  async show({ request, response, logger }: HttpContext) {
    const employeeIdRaw = request.param('employeeId')
    const employeeId = Number(employeeIdRaw)

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      response.status(400)
      return {
        type: 'error',
        title: 'Error de validación',
        detail: 'El identificador del empleado es inválido.',
        key: 'empleado-id-invalido',
      }
    }

    const employee = await Employee.query()
      .where('employee_id', employeeId)
      .whereNull('employee_deleted_at')
      .first()

    if (!employee?.employeePhoto) {
      response.status(404)
      return {
        type: 'warning',
        title: 'Foto no encontrada',
        detail: 'El empleado no tiene una foto de perfil registrada.',
        key: 'foto-no-encontrada',
      }
    }

    try {
      const entregada = await new StoredFileStreamService().streamEmployeePhotoInto(
        { response },
        employee.employeePhoto
      )

      if (entregada) return

      logger.warn(
        { employeeId },
        'Foto de empleado registrada en base de datos pero ausente en el almacenamiento'
      )
      response.status(404)
      return {
        type: 'warning',
        title: 'Foto no encontrada',
        detail: 'La foto registrada no está disponible en el almacenamiento.',
        key: 'foto-no-disponible',
      }
    } catch (error) {
      logger.error({ err: error, employeeId }, 'Error inesperado al entregar la foto del empleado')
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        detail: 'No fue posible obtener la foto del empleado.',
        key: 'foto-error-servidor',
      }
    }
  }
}
