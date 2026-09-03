import type { HttpContext } from '@adonisjs/core/http'
import ShiftExceptionEvidenceService from '#services/shift_exception_evidence_service'
import StoredFileStreamService from '#services/stored_file_stream_service'

/**
 * Salida del archivo de una evidencia de excepción de turno.
 *
 * Mismo molde que la foto de empleado: el cliente pide un RECURSO por su id y
 * el servidor resuelve la clave del objeto; la ruta del archivo nunca viaja en
 * la petición.
 *
 * El acotamiento por empresa lo hace `ShiftExceptionEvidenceService`, que
 * hereda el scope de `ShiftException`. Una evidencia de otra empresa responde
 * 404, sin revelar que existe.
 */
export default class ShiftExceptionEvidenceStreamController {
  /**
   * @swagger
   * /api/shift-exception-evidences/{shiftExceptionEvidenceId}/file:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Shift Exception Evidences
   *     summary: Archivo de la evidencia
   *     description: |
   *       Entrega el binario de la evidencia. La clave del objeto se resuelve
   *       desde el registro, acotado a la empresa activa; el cliente nunca
   *       envía rutas de almacenamiento.
   *     parameters:
   *       - in: path
   *         name: shiftExceptionEvidenceId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Binario del archivo
   *       400:
   *         description: Identificador inválido
   *       404:
   *         description: La evidencia no existe, no pertenece a la empresa activa o no tiene archivo
   */
  async show({ request, response, logger }: HttpContext) {
    const rawId = request.param('shiftExceptionEvidenceId')
    const evidenceId = Number(rawId)

    if (!Number.isInteger(evidenceId) || evidenceId <= 0) {
      response.status(400)
      return {
        type: 'error',
        title: 'Error de validación',
        detail: 'El identificador de la evidencia es inválido.',
        key: 'evidencia-id-invalido',
      }
    }

    const evidence = await new ShiftExceptionEvidenceService().show(evidenceId)

    if (!evidence?.shiftExceptionEvidenceFile) {
      response.status(404)
      return {
        type: 'warning',
        title: 'Evidencia no encontrada',
        detail: 'La evidencia no existe o no tiene un archivo asociado.',
        key: 'evidencia-no-encontrada',
      }
    }

    try {
      const entregado = await new StoredFileStreamService().streamInto(
        { response },
        evidence.shiftExceptionEvidenceFile
      )

      if (entregado) return

      logger.warn(
        { evidenceId },
        'Evidencia registrada en base de datos pero ausente en el almacenamiento'
      )
      response.status(404)
      return {
        type: 'warning',
        title: 'Evidencia no encontrada',
        detail: 'El archivo registrado no está disponible en el almacenamiento.',
        key: 'evidencia-no-disponible',
      }
    } catch (error) {
      logger.error({ err: error, evidenceId }, 'Error inesperado al entregar la evidencia')
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        detail: 'No fue posible obtener el archivo de la evidencia.',
        key: 'evidencia-error-servidor',
      }
    }
  }
}
