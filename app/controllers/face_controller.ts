import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import EmployeeBiometricFaceId from '#models/employee_biometric_face_id'
import UploadService from '#services/upload_service'
import { faceDescriptorCache } from '#services/face_descriptor_cache_service'

export default class FaceController {
  /**
   * @swagger
   * /api/verify-face:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Verify face with employee biometric face id
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeId:
   *                 type: number
   *                 description: Employe id
   *                 required: true
   *                 default: 0
   *               imageBase64:
   *                 type: string
   *                 description: Image base64
   *                 required: true
   *                 default: ''
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  @inject()
  async verify({ request, response }: HttpContext, uploadService: UploadService) {
    const { imageBase64, employeeId } = request.body()

    // Validación temprana
    if (!imageBase64 || !employeeId) {
      response.status(400)
      return {
        type: 'warning',
        title: 'Faltan datos para procesar',
        message: !imageBase64 ? 'Imagen no encontrada' : 'Id del empleado no encontrado',
        data: { employeeId: employeeId || null },
      }
    }

    try {
      // 1. Convertir base64 a buffer inmediatamente (operación rápida)
      const imageBuffer = Buffer.from(imageBase64, 'base64')

      // 2. Buscar datos biométricos del empleado (necesario antes de paralelizar)
      const biometricFaceId = await EmployeeBiometricFaceId.query()
        .where('employee_id', employeeId)
        .whereNull('employee_biometric_face_id_deleted_at')
        .first()

      if (!biometricFaceId?.employeeBiometricFaceIdPhotoUrl) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Faltan datos para procesar',
          message: 'No se encontró foto biométrica de referencia para este empleado',
          data: { employeeId },
        }
      }

      const photoUrl = biometricFaceId.employeeBiometricFaceIdPhotoUrl

      // 3. OPTIMIZACIÓN CLAVE: Ejecutar en PARALELO:
      //    - Obtener descriptor de referencia (desde caché o S3)
      //    - Calcular descriptor de la imagen enviada
      const [referenceDescriptor, inputDescriptor] = await Promise.all([
        // Obtener descriptor del empleado (con caché LRU)
        faceDescriptorCache.getEmployeeDescriptor(
          employeeId,
          photoUrl,
          async () => {
            const url = await uploadService.getDownloadLink(photoUrl, 60 * 60)
            return typeof url === 'string' ? url : null
          }
        ),
        // Calcular descriptor de la imagen enviada
        faceDescriptorCache.computeDescriptor(imageBuffer),
      ])

      // Validar que ambos descriptores se obtuvieron correctamente
      if (!referenceDescriptor) {
        response.status(400)
        return {
          type: 'error',
          title: 'Error del servidor',
          message: 'No se detectó rostro en la imagen de referencia del empleado',
          data: { employeeId },
        }
      }

      if (!inputDescriptor) {
        response.status(400)
        return {
          type: 'error',
          title: 'Error del servidor',
          message: 'No se detectó rostro en la imagen enviada',
          data: { employeeId },
        }
      }

      // 4. Comparar descriptores (operación muy rápida, ~1ms)
      const result = faceDescriptorCache.compareDescriptors(
        referenceDescriptor,
        inputDescriptor,
        0.6
      )

      response.status(200)
      return {
        match: result.match,
        distance: result.distance,
        threshold: result.threshold,
        message: result.match ? '✅ Misma persona' : '❌ Persona diferente',
      }
    } catch (error: any) {
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Error procesando la verificación facial',
        error: error.message,
      }
    }
  }
}
