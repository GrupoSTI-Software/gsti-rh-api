import * as faceapi from 'face-api.js'
import canvas from 'canvas'
import path from 'node:path'

const { Canvas, Image, ImageData } = canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData } as any)

const MODEL_PATH = path.join(process.cwd(), 'models')
export let referenceDescriptor: Float32Array | null = null
let modelsLoaded = false
let modelsLoading: Promise<void> | null = null

/**
 * Carga los modelos de FaceAPI (solo se cargan una vez)
 * Optimizado: usa TinyFaceDetector para mayor velocidad
 */
async function loadModels() {
  if (modelsLoaded) return

  // Evitar cargas paralelas con promise singleton
  if (modelsLoading) {
    await modelsLoading
    return
  }

  modelsLoading = loadModelsInternal()
  await modelsLoading
}

async function loadModelsInternal() {
  // Cargar modelos en paralelo: SSD Mobilenet + Tiny Landmarks para balance velocidad/precisión
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH),
    faceapi.nets.faceLandmark68TinyNet.loadFromDisk(MODEL_PATH),
    faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH),
  ])
  modelsLoaded = true
}

/**
 * Detecta rostro y obtiene descriptor de forma optimizada
 * @param imageSource - Buffer o URL de la imagen
 * @returns descriptor facial o null si no se detectó
 */
export async function detectFaceDescriptor(
  imageSource: Buffer | string
): Promise<Float32Array | null> {
  await loadModels()

  try {
    const img = await canvas.loadImage(imageSource)

    // SSD Mobilenet + Tiny Landmarks para balance velocidad/precisión
    const detection = await faceapi
      .detectSingleFace(img)
      .withFaceLandmarks(true) // true = tiny landmarks (más rápido)
      .withFaceDescriptor()

    return detection?.descriptor || null
  } catch {
    return null
  }
}

/**
 * Carga la imagen de referencia desde una URL o ruta local
 * @deprecated Usar faceDescriptorCache.getEmployeeDescriptor() para mejor rendimiento
 */
export async function loadReferenceImage(referenceImageUrl: string): Promise<boolean> {
  const descriptor = await detectFaceDescriptor(referenceImageUrl)
  if (descriptor) {
    referenceDescriptor = descriptor
    return true
  }
  console.warn('⚠️ No se detectó rostro en la imagen de referencia')
  return false
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

/**
 * Pre-carga los modelos al iniciar la aplicación
 */
export async function preloadModels(): Promise<void> {
  await loadModels()
}
