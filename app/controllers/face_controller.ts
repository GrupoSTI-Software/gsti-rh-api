import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import * as faceapi from 'face-api.js'
import canvas from 'canvas'
import { loadReferenceImage, referenceDescriptor } from '#start/face_api'
import EmployeeBiometricFaceId from '#models/employee_biometric_face_id'
import UploadService from '#services/upload_service'

const { Canvas, Image, ImageData } = canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData })

export default class FaceController {
  @inject()
  async verify(
    { request, response }: HttpContext,
    uploadService: UploadService
  ) {
    const { imageBase64, employeeId } = request.body()
    if (!imageBase64) {
      response.status(400)
      return {
        type: 'warning',
        title: 'Faltan datos para procesar',
        message: 'Imagen no encontrada',
        data: { employeeId, imageBase64 },
      }
    }

    if (!employeeId) {
      response.status(400)
      return {
        type: 'warning',
        title: 'Faltan datos para procesar',
        message: 'Id del empleado no encontrado',
        data: { employeeId, imageBase64 },
      }
    }
    
    try {
      const biometricFaceId = await EmployeeBiometricFaceId.query()
        .where('employee_id', employeeId)
        .whereNull('employee_biometric_face_id_deleted_at')
        .first()

      if (!biometricFaceId || !biometricFaceId.employeeBiometricFaceIdPhotoUrl) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Faltan datos para procesar',
          message: 'No se encontró foto biométrica de referencia para este empleado',
          data: { employeeId, imageBase64 },
        }
      }

      // Obtener URL temporal de la foto de referencia
      const referenceImageUrl = await uploadService.getDownloadLink(
        biometricFaceId.employeeBiometricFaceIdPhotoUrl,
        60 * 60
      )

      if (typeof referenceImageUrl !== 'string') {
        response.status(400)
        return {
          type: 'error',
          title: 'Error del servidor',
          message: 'Error al obtener la imagen de referencia',
          data: { employeeId, imageBase64 },
        }
      }

      // Cargar la imagen de referencia del empleado en el sistema FaceAPI
      const loaded = await loadReferenceImage(referenceImageUrl)

      if (!loaded || !referenceDescriptor) {
        response.status(400)
        return {
          type: 'error',
          title: 'Error del servidor',
          message: 'No se detectó rostro en la imagen de referencia del empleado',
          data: { employeeId, imageBase64 },
        }
      }

      // Procesar la imagen enviada para verificación
      const buffer = Buffer.from(imageBase64, 'base64')
      const img = await canvas.loadImage(buffer)

      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor()

      if (!detection) {
        response.status(400)
        return {
          type: 'error',
          title: 'Error del servidor',
          message: 'No se detectó rostro en la imagen enviada',
          data: { employeeId, imageBase64 },
        }
      }

      // Comparar los descriptores faciales usando el descriptor de referencia cargado
      const distance = faceapi.euclideanDistance(
        referenceDescriptor,
        detection.descriptor
      )
      const match = distance < 0.6 // umbral ajustable
      response.status(200)
      return response.json({
        match,
        distance,
        threshold: 0.6,
        message: match ? '✅ Misma persona' : '❌ Persona diferente',
      })
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