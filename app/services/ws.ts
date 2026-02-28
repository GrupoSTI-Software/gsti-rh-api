import { Server } from 'socket.io'
import AdonisServer from '@adonisjs/core/services/server'

/** Promesa pendiente de respuesta de info de dispositivo ZK (serial_number → resolve/reject) */
type PendingZkDeviceInfo = {
  resolve: (value: unknown) => void
  reject: (reason?: string) => void
  timeoutId: ReturnType<typeof setTimeout>
}

class Ws {
  io: Server | undefined
  private booted = false

  /** Promesas pendientes de "zkdevice-info" por serial_number (para updateConnectionStatus) */
  private pendingZkDeviceInfoRequests = new Map<string, PendingZkDeviceInfo>()

  /**
   * Registra una espera por la respuesta del dispositivo con el serial dado.
   * El connector debe emitir "device-info" con ese serial para que se resuelva.
   * @param serialNumber Serial del dispositivo
   * @param timeoutMs Tiempo máximo de espera en ms
   * @returns Promesa que se resuelve con los datos recibidos o se rechaza por timeout
   */
  waitForZkDeviceInfo(serialNumber: string, timeoutMs: number): Promise<unknown> {
    const key = String(serialNumber).trim()
    if (!key) {
      return Promise.reject(new Error('serial_number vacío'))
    }
    if (this.pendingZkDeviceInfoRequests.has(key)) {
      return Promise.reject(new Error('Ya hay una solicitud pendiente para este dispositivo'))
    }
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingZkDeviceInfoRequests.delete(key)) {
          reject(new Error('TIMEOUT'))
        }
      }, timeoutMs)
      this.pendingZkDeviceInfoRequests.set(key, { resolve, reject, timeoutId })
    })
  }

  /**
   * Resuelve una espera pendiente de info de dispositivo (llamado desde socket al recibir "device-info").
   */
  resolveZkDeviceInfo(serialNumber: string, data: unknown): void {
    const key = String(serialNumber).trim()
    const pending = this.pendingZkDeviceInfoRequests.get(key)
    if (pending) {
      clearTimeout(pending.timeoutId)
      this.pendingZkDeviceInfoRequests.delete(key)
      pending.resolve(data)
    }
  }

  /**
   * Rechaza una espera pendiente (p. ej. para limpieza o error).
   */
  rejectZkDeviceInfo(serialNumber: string, reason?: string): void {
    const key = String(serialNumber).trim()
    const pending = this.pendingZkDeviceInfoRequests.get(key)
    if (pending) {
      clearTimeout(pending.timeoutId)
      this.pendingZkDeviceInfoRequests.delete(key)
      pending.reject(reason)
    }
  }

  boot() {
    /**
     * Ignore multiple calls to the boot method
     */
    if (this.booted) {
      return
    }
    this.booted = true
    this.io = new Server(AdonisServer.getNodeServer()!, {
      cors: {
        origin: '*',
      },
    })
  }
}

export default new Ws()
