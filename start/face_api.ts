import * as faceapi from 'face-api.js'
import canvas from 'canvas'
import path from 'node:path'

const { Canvas, Image, ImageData } = canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData })

const MODEL_PATH = path.join(process.cwd(), 'models')
export let referenceDescriptor: Float32Array | null = null
let modelsLoaded = false

/**
 * Carga los modelos de FaceAPI (solo se cargan una vez)
 */
async function loadModels() {
  if (modelsLoaded) {
    return
  }

  //console.log('⏳ Cargando modelos de FaceAPI...')
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH)
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_PATH)
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH)
  modelsLoaded = true
  //console.log('✅ Modelos cargados')
}

/**
 * Carga la imagen de referencia desde una URL o ruta local
 * @param referenceImageUrl - URL HTTPS completa de la imagen de referencia o ruta local
 * @returns true si se cargó correctamente, false en caso contrario
 */
export async function loadReferenceImage(referenceImageUrl: string): Promise<boolean> {
  try {
    // Asegurar que los modelos estén cargados
    await loadModels()

    // canvas.loadImage puede manejar tanto URLs HTTPS como rutas locales
    const img = await canvas.loadImage(referenceImageUrl)
    const detection = await faceapi
      .detectSingleFace(img)
      .withFaceLandmarks()
      .withFaceDescriptor()

    if (detection) {
      referenceDescriptor = detection.descriptor
      //console.log('✅ Imagen de referencia cargada correctamente')
      return true
    } else {
      console.warn('⚠️ No se detectó rostro en la imagen de referencia')
      return false
    }
  } catch (error) {
    console.error(error)
    return false
  }
}

/**
 * Carga los modelos de FaceAPI y la imagen de referencia
 * @param referenceImageUrl - URL HTTPS completa de la imagen de referencia o ruta local (opcional)
 */
export async function loadFaceApi(referenceImageUrl?: string) {
  await loadModels()

  // Si no se proporciona URL, usar la ruta local por defecto
  const defaultImagePath = path.join(process.cwd(), 'reference.jpeg')
  const imagePath = referenceImageUrl || defaultImagePath

  if (!referenceImageUrl) {
    console.warn('⚠️ No se proporcionó URL de imagen de referencia, usando archivo local por defecto')
  }

  await loadReferenceImage(imagePath)
}
