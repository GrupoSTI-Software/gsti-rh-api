import type { HttpContext } from '@adonisjs/core/http'
import * as faceapi from 'face-api.js'
import canvas from 'canvas'
import { referenceDescriptor } from '#start/face_api'

const { Canvas, Image, ImageData } = canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData })

export default class FaceController {
  async verify({ request, response }: HttpContext) {
    const { imageBase64 } = request.body()

    if (!imageBase64) {
      return response.badRequest({ message: 'Falta la imagen Base64' })
    }

    if (!referenceDescriptor) {
      return response.internalServerError({
        message: 'No hay descriptor de referencia cargado',
      })
    }

    try {
      const buffer = Buffer.from(imageBase64, 'base64')
      const img = await canvas.loadImage(buffer)

      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor()
      if (!detection) {
        return response.json({ match: false, message: 'No se detectó rostro' })
      }

      const distance = faceapi.euclideanDistance(
        referenceDescriptor,
        detection.descriptor
      )
      const match = distance < 0.6 // umbral ajustable

      return response.json({
        match,
        distance,
        message: match ? '✅ Misma persona' : '❌ Persona diferente',
      })
    } catch (error) {
      console.error(error)
      return response.internalServerError({
        message: 'Error procesando la imagen',
        error: error.message,
      })
    }
  }
}