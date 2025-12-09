import { loadFaceApi } from '#start/face_api'
import type { ApplicationService } from '@adonisjs/core/types'

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
    await loadFaceApi() 
  }

  /**
   * Preparing to shutdown the app
   */
  async shutdown() {}
}
