import type { ApplicationService } from '@adonisjs/core/types'
import { faceDescriptorCache } from '#services/face_descriptor_cache_service'
import logger from '@adonisjs/core/services/logger'

export default class AppProvider {
  constructor(protected app: ApplicationService) {}

  /**
   * Register bindings to the container
   */
  register() {}

  /**
   * The container bindings have booted
   */
  async boot() {}

  /**
   * The application has been booted
   */
  async start() {}

  /**
   * The process has been started
   */
  async ready() {
    await import('../start/socket.js')

    // Pre-cargar modelos de reconocimiento facial para eliminar cold start
    // Esto se ejecuta en background para no bloquear el inicio del servidor
    faceDescriptorCache.warmup().catch((err) => {
      logger.error({ err }, '⚠️ Error precargando modelos faciales')
    })
  }

  /**
   * Preparing to shutdown the app
   */
  async shutdown() {}
}
