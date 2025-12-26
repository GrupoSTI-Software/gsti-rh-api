import * as faceapi from 'face-api.js'
import canvas from 'canvas'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'

const { Canvas, Image, ImageData } = canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData } as any)

const MODEL_PATH = path.join(process.cwd(), 'models')

/**
 * Descarga imagen desde URL con timeout configurable
 * Más robusto que canvas.loadImage para URLs remotas
 */
async function downloadImageBuffer(
  url: string,
  timeoutMs: number = 30000
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http

    const request = protocol.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: Failed to download image`))
        return
      }

      const chunks: Uint8Array[] = []
      res.on('data', (chunk: Uint8Array) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })

    request.on('error', reject)
    request.on('timeout', () => {
      request.destroy()
      reject(new Error('Download timeout'))
    })
  })
}

/**
 * Descarga imagen con reintentos
 */
async function downloadWithRetry(
  url: string,
  maxRetries: number = 2,
  timeoutMs: number = 30000
): Promise<Buffer> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await downloadImageBuffer(url, timeoutMs)
    } catch (error) {
      lastError = error as Error
      console.warn(`Download attempt ${attempt + 1} failed:`, (error as Error).message)

      // Esperar antes de reintentar (backoff exponencial)
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }

  throw lastError || new Error('Download failed after retries')
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
  private readonly maxSize: number = 500 // Máximo de entradas en caché
  private readonly ttlMs: number = 30 * 60 * 1000 // 30 minutos TTL
  private modelsLoaded: boolean = false
  private modelsLoading: Promise<void> | null = null

  /**
   * Carga los modelos de FaceAPI (singleton pattern con promise)
   * Usa TinyFaceDetector para mayor velocidad en verificación
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
    // Cargar modelos en paralelo para inicialización más rápida
    // Usamos SSD Mobilenet que ya está disponible + tiny landmarks para balance velocidad/precisión
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH),
      faceapi.nets.faceLandmark68TinyNet.loadFromDisk(MODEL_PATH),
      faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH),
    ])
    this.modelsLoaded = true
  }

  /**
   * Obtiene descriptor del caché si existe y es válido
   */
  get(employeeId: number, photoUrl: string): Float32Array | null {
    const entry = this.cache.get(employeeId)
    if (!entry) return null

    // Verificar TTL y que la URL sea la misma (por si se actualizó la foto)
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
    // Evict si está lleno (LRU - eliminar el más antiguo)
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
   * Calcula descriptor facial de una imagen (URL o buffer)
   * Usa SSD Mobilenet + Tiny Landmarks para balance velocidad/precisión
   */
  async computeDescriptor(
    imageSource: string | Buffer
  ): Promise<Float32Array | null> {
    await this.ensureModelsLoaded()

    try {
      let imageBuffer: Buffer

      // Si es una URL, descargar con timeout y reintentos
      if (typeof imageSource === 'string' && imageSource.startsWith('http')) {
        imageBuffer = await downloadWithRetry(imageSource, 2, 30000)
      } else if (typeof imageSource === 'string') {
        // Ruta local - usar canvas.loadImage directamente
        const img = await canvas.loadImage(imageSource)
        const detection = await faceapi
          .detectSingleFace(img)
          .withFaceLandmarks(true)
          .withFaceDescriptor()
        return detection?.descriptor || null
      } else {
        imageBuffer = imageSource
      }

      const img = await canvas.loadImage(imageBuffer)

      // SSD Mobilenet + Tiny Landmarks para mejor balance
      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks(true) // true = usar tiny landmarks (más rápido)
        .withFaceDescriptor()

      return detection?.descriptor || null
    } catch (error) {
      console.error('Error computing face descriptor:', error)
      return null
    }
  }

  /**
   * Obtiene descriptor de empleado (desde caché o lo calcula)
   * Esta es la función principal optimizada
   * @param getImageSource - Función que retorna Buffer (descarga S3) o string (URL)
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

    // 2. Obtener imagen (Buffer o URL) y calcular descriptor
    const imageSource = await getImageSource()
    if (!imageSource) return null

    const descriptor = await this.computeDescriptor(imageSource)
    if (!descriptor) return null

    // 3. Guardar en caché para futuras peticiones
    this.set(employeeId, descriptor, photoUrl)

    return descriptor
  }

  /**
   * Verifica dos descriptores faciales
   * @returns objeto con match, distance y threshold
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
   * Estadísticas del caché (para debugging/monitoring)
   */
  getStats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    }
  }
}

// Singleton instance
export const faceDescriptorCache = new FaceDescriptorCacheService()
export default FaceDescriptorCacheService

