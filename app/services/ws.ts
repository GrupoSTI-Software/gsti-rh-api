import { Server, Socket } from 'socket.io'
import AdonisServer from '@adonisjs/core/services/server'

/** Promesa pendiente de respuesta de info de dispositivo ZK (serial_number → resolve/reject) */
type PendingZkDeviceInfo = {
  resolve: (value: unknown) => void
  reject: (reason?: string) => void
  timeoutId: ReturnType<typeof setTimeout>
}

/** Promesa pendiente de respuesta de creación de empleado ZK */
type PendingZkCreateEmployee = {
  resolve: (value: unknown) => void
  reject: (reason?: string) => void
  timeoutId: ReturnType<typeof setTimeout>
}

class Ws {
  io: Server | undefined
  private booted = false

  /** Promesas pendientes de "zkdevice-info" por serial_number (para updateConnectionStatus) */
  private pendingZkDeviceInfoRequests = new Map<string, PendingZkDeviceInfo>()

  /** Sockets de dispositivos ZKTeco conectados, indexados por serial_number */
  zkDeviceSockets = new Map<string, Socket>()

  /** Promesas pendientes de "zkm-create-employee" por clave única */
  private pendingZkCreateEmployeeRequests = new Map<string, PendingZkCreateEmployee>()

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

  /**
   * Registra un socket de dispositivo ZKTeco
   */
  registerZkDeviceSocket(serialNumber: string, socket: Socket): void {
    const key = String(serialNumber).trim()
    if (key) {
      this.zkDeviceSockets.set(key, socket)
      // eslint-disable-next-line no-console
      console.log(`[Ws] Dispositivo ZKTeco registrado: ${key}`)
    }
  }

  /**
   * Elimina un socket de dispositivo ZKTeco
   */
  unregisterZkDeviceSocket(serialNumber: string): void {
    const key = String(serialNumber).trim()
    if (this.zkDeviceSockets.delete(key)) {
      // eslint-disable-next-line no-console
      console.log(`[Ws] Dispositivo ZKTeco desregistrado: ${key}`)
    }
  }

  /**
   * Obtiene el socket de un dispositivo ZKTeco por su serial number
   */
  getZkDeviceSocket(serialNumber: string): Socket | undefined {
    const key = String(serialNumber).trim()
    return this.zkDeviceSockets.get(key)
  }

  /**
   * Emite un evento de creación de empleado a un dispositivo ZKTeco específico y espera su respuesta
   * @param serialNumber Serial del dispositivo
   * @param data Datos del empleado a crear
   * @param timeoutMs Tiempo máximo de espera en ms
   * @returns Promesa que se resuelve con la respuesta del dispositivo o se rechaza por timeout
   */
  async emitZkCreateEmployee(serialNumber: string, data: any, timeoutMs: number = 10000): Promise<unknown> {
    const key = String(serialNumber).trim()
    if (!key) {
      return Promise.reject(new Error('serial_number vacío'))
    }

    const socket = this.zkDeviceSockets.get(key)
    if (!socket) {
      return Promise.reject(new Error(`Dispositivo ZKTeco con serial ${key} no está conectado`))
    }

    // Crear una clave única para esta solicitud (serial + timestamp + random)
    const requestKey = `${key}-${Date.now()}-${Math.random()}`

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingZkCreateEmployeeRequests.delete(requestKey)) {
          reject(new Error('TIMEOUT: No se recibió respuesta del dispositivo ZKTeco'))
        }
      }, timeoutMs)

      this.pendingZkCreateEmployeeRequests.set(requestKey, { resolve, reject, timeoutId })

      // Emitir al socket específico con callback de ACK
      socket.emit('zkm-create-employee', data, (response: unknown) => {
        const pending = this.pendingZkCreateEmployeeRequests.get(requestKey)
        if (pending) {
          clearTimeout(pending.timeoutId)
          this.pendingZkCreateEmployeeRequests.delete(requestKey)
          pending.resolve(response)
        }
      })
    })
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
