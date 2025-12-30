import * as faceapi from 'face-api.js'
import { createCanvas, loadImage, Image } from '@napi-rs/canvas'
import path from 'node:path'

// Crear clase ImageData compatible para @napi-rs/canvas
class NodeImageData {
  data: Uint8ClampedArray
  width: number
  height: number

  constructor(data: Uint8ClampedArray, width: number, height?: number) {
    this.data = data
    this.width = height ? width : data.length / 4 / width
    this.height = height || (data.length / 4 / width)
  }
}

// Monkey patch para face-api.js con @napi-rs/canvas
faceapi.env.monkeyPatch({
  Canvas: createCanvas(1, 1).constructor as any,
  Image: Image as any,
  ImageData: NodeImageData as any,
  createCanvasElement: () => createCanvas(1, 1),
  createImageElement: () => new Image(),
} as any)

const MODEL_PATH = path.join(process.cwd(), 'models')
export let referenceDescriptor: Float32Array | null = null
let modelsLoaded = false
let modelsLoading: Promise<void> | null = null

/**
 * Carga los modelos de FaceAPI (solo se cargan una vez)
 * @deprecated Usar faceDescriptorCache del servicio para mejor rendimiento
 */
async function loadModels() {
  if (modelsLoaded) return

  if (modelsLoading) {
    await modelsLoading
    return
  }

  modelsLoading = loadModelsInternal()
  await modelsLoading
}

async function loadModelsInternal() {
  // Cargar modelos en paralelo
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH),
    faceapi.nets.faceLandmark68TinyNet.loadFromDisk(MODEL_PATH),
    faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH),
  ])
  modelsLoaded = true
}

/**
 * Detecta rostro y obtiene descriptor
 * @deprecated Usar faceDescriptorCache.computeDescriptor() para mejor rendimiento
 */
export async function detectFaceDescriptor(
  imageSource: Buffer | string
): Promise<Float32Array | null> {
  await loadModels()

  try {
    const img = await loadImage(imageSource)

    const detection = await faceapi
      .detectSingleFace(img)
      .withFaceLandmarks(true)
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
  return false
}

/**
 * Carga los modelos de FaceAPI y la imagen de referencia
 * @deprecated Usar faceDescriptorCache.warmup() para mejor rendimiento
 */
export async function loadFaceApi(referenceImageUrl?: string) {
  await loadModels()

  const defaultImagePath = path.join(process.cwd(), 'reference.jpeg')
  const imagePath = referenceImageUrl || defaultImagePath

  await loadReferenceImage(imagePath)
}

/**
 * Pre-carga los modelos al iniciar la aplicación
 * @deprecated Usar faceDescriptorCache.warmup() para mejor rendimiento
 */
export async function preloadModels(): Promise<void> {
  await loadModels()
}
