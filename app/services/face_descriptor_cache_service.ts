import * as faceapi from 'face-api.js'
import UploadService from '#services/upload_service'
import { createCanvas, loadImage, Image } from '@napi-rs/canvas'
import path from 'node:path'
import fs from 'node:fs'
// import logger from '@adonisjs/core/services/logger'

// Crear clase ImageData compatible para @napi-rs/canvas
class NodeImageData {
  data: Uint8ClampedArray
  width: number
  height: number

  constructor(data: Uint8ClampedArray, width: number, height?: number) {
    this.data = data
    this.width = width
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

// ============ CONFIGURACIÓN DE RENDIMIENTO ============
const CONFIG = {
  // Tamaño máximo de imagen para procesamiento (reducir = más rápido)
  // 320 es muy rápido pero menos preciso, 640 es buen balance
  MAX_IMAGE_SIZE: 480,

  // Usar TinyFaceDetector si está disponible (5-10x más rápido)
  // Se detecta automáticamente si el modelo existe
  USE_TINY_DETECTOR: true,

  // minConfidence para SSD Mobilenet (menor = más rápido pero puede fallar en fotos difíciles)
  SSD_MIN_CONFIDENCE: 0.5,

  // Timeout para descargas de red
  DOWNLOAD_TIMEOUT_MS: 15000,

  // Caché configuración
  CACHE_MAX_SIZE: 1000,
  CACHE_TTL_MS: 60 * 60 * 1000, // 1 hora
}

/**
 * Verifica si TinyFaceDetector está disponible
 */
function hasTinyFaceDetector(): boolean {
  const manifestPath = path.join(MODEL_PATH, 'tiny_face_detector_model-weights_manifest.json')
  return fs.existsSync(manifestPath)
}

/**
 * Lee la imagen del bucket por la referencia guardada (key privada o URL
 * historica). Sustituye al HTTP GET directo: con la foto en ACL privada, el
 * campo ya no es una URL alcanzable sin credenciales.
 */
async function downloadImageBuffer(
  storedPath: string,
  _timeoutMs: number = CONFIG.DOWNLOAD_TIMEOUT_MS
): Promise<Buffer> {
  const buffer = await new UploadService().readStoredFileBuffer(storedPath)
  if (!buffer) {
    throw new Error('No fue posible leer la imagen del almacenamiento')
  }
  return buffer
}

/**
 * Descarga imagen con reintentos (máximo 1 reintento para velocidad)
 */
async function downloadWithRetry(url: string, maxRetries: number = 1, timeoutMs: number = CONFIG.DOWNLOAD_TIMEOUT_MS): Promise<Buffer> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await downloadImageBuffer(url, timeoutMs)
    } catch (error) {
      lastError = error as Error
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500)) // Espera corta
      }
    }
  }

  throw lastError || new Error('Download failed after retries')
}

/**
 * OPTIMIZACIÓN CLAVE: Redimensiona imagen para procesamiento más rápido
 * Una imagen de 480px es suficiente para detección facial confiable
 */
async function resizeImageForProcessing(imageBuffer: Buffer): Promise<Image> {
  const img = await loadImage(imageBuffer)

  // Si la imagen ya es pequeña, devolverla tal cual
  if (img.width <= CONFIG.MAX_IMAGE_SIZE && img.height <= CONFIG.MAX_IMAGE_SIZE) {
    return img
  }

  // Calcular nuevo tamaño manteniendo aspect ratio
  const scale = CONFIG.MAX_IMAGE_SIZE / Math.max(img.width, img.height)
  const newWidth = Math.round(img.width * scale)
  const newHeight = Math.round(img.height * scale)

  // Crear canvas redimensionado
  const resizedCanvas = createCanvas(newWidth, newHeight)
  const ctx = resizedCanvas.getContext('2d')
  ctx.drawImage(img, 0, 0, newWidth, newHeight)

  // Convertir a buffer y cargar de nuevo como imagen
  const resizedBuffer = resizedCanvas.toBuffer('image/jpeg')
  return await loadImage(resizedBuffer)
}

/**
 * Estructura de entrada en caché
 */
interface CacheEntry {
  descriptor: Float32Array
  timestamp: number
  photoUrl: string
}

/**
 * Servicio de caché LRU para descriptores faciales
 * Optimizado para verificación biométrica de alta velocidad
 */
class FaceDescriptorCacheService {
  private cache: Map<number, CacheEntry> = new Map()
  private readonly maxSize: number = CONFIG.CACHE_MAX_SIZE
  private readonly ttlMs: number = CONFIG.CACHE_TTL_MS
  private modelsLoaded: boolean = false
  private modelsLoading: Promise<void> | null = null
  private useTinyDetector: boolean = false

  /**
   * Carga los modelos de FaceAPI (singleton pattern con promise)
   * Detecta automáticamente si TinyFaceDetector está disponible
   */
  async ensureModelsLoaded(): Promise<void> {
    if (this.modelsLoaded) return

    if (this.modelsLoading) {
      await this.modelsLoading
      return
    }

    this.modelsLoading = this.loadModelsInternal()
    await this.modelsLoading
  }

  private async loadModelsInternal(): Promise<void> {
    // const startTime = Date.now()

    // Verificar si TinyFaceDetector está disponible
    this.useTinyDetector = CONFIG.USE_TINY_DETECTOR && hasTinyFaceDetector()

    const modelsToLoad: Promise<void>[] = [
      faceapi.nets.faceLandmark68TinyNet.loadFromDisk(MODEL_PATH),
      faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH),
    ]

    if (this.useTinyDetector) {
      // logger.info('🚀 Usando TinyFaceDetector (modo rápido)')
      modelsToLoad.push(faceapi.nets.tinyFaceDetector.loadFromDisk(MODEL_PATH))
    } else {
      // logger.info('📦 Usando SSD Mobilenet (modo estándar)')
      modelsToLoad.push(faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH))
    }

    await Promise.all(modelsToLoad)
    this.modelsLoaded = true

    // logger.info(`✅ Modelos cargados en ${Date.now() - startTime}ms`)
  }

  /**
   * Obtiene descriptor del caché si existe y es válido
   */
  get(employeeId: number, photoUrl: string): Float32Array | null {
    const entry = this.cache.get(employeeId)
    if (!entry) return null

    const isExpired = Date.now() - entry.timestamp > this.ttlMs
    const urlChanged = entry.photoUrl !== photoUrl

    if (isExpired || urlChanged) {
      this.cache.delete(employeeId)
      return null
    }

    // Mover al final (LRU - más reciente)
    this.cache.delete(employeeId)
    this.cache.set(employeeId, entry)

    return entry.descriptor
  }

  /**
   * Almacena descriptor en caché
   */
  set(employeeId: number, descriptor: Float32Array, photoUrl: string): void {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
      }
    }

    this.cache.set(employeeId, {
      descriptor,
      timestamp: Date.now(),
      photoUrl,
    })
  }

  /**
   * Invalida entrada de caché para un empleado
   */
  invalidate(employeeId: number): void {
    this.cache.delete(employeeId)
  }

  /**
   * Limpia todo el caché
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * OPTIMIZADO: Detecta rostro usando el mejor detector disponible
   * TinyFaceDetector: ~50-100ms | SSD Mobilenet: ~300-800ms
   */
  private async detectFace(img: Image): Promise<faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }, faceapi.FaceLandmarks68>> | undefined> {
    if (this.useTinyDetector) {
      // TinyFaceDetector es 5-10x más rápido
      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: 320, // 320 es más rápido, 416/512 más preciso
        scoreThreshold: 0.5,
      })
      return await faceapi
        .detectSingleFace(img, options)
        .withFaceLandmarks(true)
        .withFaceDescriptor()
    } else {
      // SSD Mobilenet - más lento pero disponible
      const options = new faceapi.SsdMobilenetv1Options({
        minConfidence: CONFIG.SSD_MIN_CONFIDENCE,
      })
      return await faceapi
        .detectSingleFace(img, options)
        .withFaceLandmarks(true)
        .withFaceDescriptor()
    }
  }

  /**
   * Calcula descriptor facial de una imagen (URL o buffer)
   * OPTIMIZADO: Redimensiona imagen para procesamiento más rápido
   */
  async computeDescriptor(imageSource: string | Buffer): Promise<Float32Array | null> {
    await this.ensureModelsLoaded()

    try {
      let img: Image

      if (typeof imageSource === 'string' && imageSource.startsWith('http')) {
        const imageBuffer = await downloadWithRetry(imageSource, 1, CONFIG.DOWNLOAD_TIMEOUT_MS)
        img = await resizeImageForProcessing(imageBuffer)
      } else if (typeof imageSource === 'string') {
        // Ruta local
        const localBuffer = fs.readFileSync(imageSource)
        img = await resizeImageForProcessing(localBuffer)
      } else {
        img = await resizeImageForProcessing(imageSource)
      }

      const detection = await this.detectFace(img)
      return detection?.descriptor || null
    } catch (error) {
      // logger.error({ error }, 'Error computing face descriptor')
      return null
    }
  }

  /**
   * Obtiene descriptor de empleado (desde caché o lo calcula)
   */
  async getEmployeeDescriptor(
    employeeId: number,
    photoUrl: string,
    getImageSource: () => Promise<string | Buffer | null>
  ): Promise<Float32Array | null> {
    // 1. Intentar obtener del caché
    const cached = this.get(employeeId, photoUrl)
    if (cached) {
      return cached
    }

    // 2. Obtener imagen y calcular descriptor
    const imageSource = await getImageSource()
    if (!imageSource) return null

    const descriptor = await this.computeDescriptor(imageSource)
    if (!descriptor) return null

    // 3. Guardar en caché
    this.set(employeeId, descriptor, photoUrl)

    return descriptor
  }

  /**
   * Verifica dos descriptores faciales
   */
  compareDescriptors(
    descriptor1: Float32Array,
    descriptor2: Float32Array,
    threshold: number = 0.6
  ): { match: boolean; distance: number; threshold: number } {
    const distance = faceapi.euclideanDistance(descriptor1, descriptor2)
    return {
      match: distance < threshold,
      distance,
      threshold,
    }
  }

  /**
   * Estadísticas del caché
   */
  getStats(): { size: number; maxSize: number; useTinyDetector: boolean } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      useTinyDetector: this.useTinyDetector,
    }
  }

  /**
   * Pre-warmup: Cargar modelos anticipadamente
   * Llamar esto al iniciar la aplicación para eliminar cold start
   */
  async warmup(): Promise<void> {
    // logger.info('🔥 Iniciando warmup de modelos de reconocimiento facial...')
    // const start = Date.now()
    await this.ensureModelsLoaded()
    // logger.info(`🔥 Warmup completado en ${Date.now() - start}ms`)
  }
}

// Singleton instance
export const faceDescriptorCache = new FaceDescriptorCacheService()
export default FaceDescriptorCacheService
