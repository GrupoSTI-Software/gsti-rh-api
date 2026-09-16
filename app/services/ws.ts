import { Server, Socket } from 'socket.io'
import AdonisServer from '@adonisjs/core/services/server'
import { timingSafeEqual } from 'node:crypto'
import env from '#start/env'

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
   * Emite un evento de creación de empleado a un dispositivo ZKTeco específico y espera su respuesta.
   * Si no se proporciona serialNumber (o es vacío), se usa el primer dispositivo conectado disponible
   * y el conector asignará el dispositivo por defecto.
   * @param serialNumber Serial del dispositivo (opcional)
   * @param data Datos del empleado a crear
   * @param timeoutMs Tiempo máximo de espera en ms
   * @returns Promesa que se resuelve con la respuesta del dispositivo o se rechaza por timeout
   */
  async emitZkCreateEmployee(serialNumber: string | undefined, data: any, timeoutMs: number = 10000): Promise<unknown> {
    const key = String(serialNumber ?? '').trim()

    let socket: Socket | undefined
    if (key) {
      socket = this.zkDeviceSockets.get(key)
      if (!socket) {
        return Promise.reject(new Error(`Dispositivo ZKTeco con serial ${key} no está conectado`))
      }
    } else {
      socket = this.zkDeviceSockets.values().next().value as Socket | undefined
      if (!socket) {
        return Promise.reject(new Error('No hay dispositivos ZKTeco conectados'))
      }
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

    /**
     * Quien se conecta con el token del puente queda marcado como tal.
     *
     * No se rechaza la conexion sin token: por este mismo socket habla tambien
     * el Backoffice, que es una sesion de usuario y no lleva este secreto. Lo
     * que se marca aqui lo exigen despues los eventos que solo puede emitir un
     * checador --dar de alta un equipo, registrar una checada-- y que hasta
     * ahora aceptaba cualquiera que supiera la direccion del servidor.
     */
    this.io.use((socket, next) => {
      const offered = socket.handshake.auth?.token
      socket.data.isBridge = isBridgeToken(typeof offered === 'string' ? offered : null)
      next()
    })
  }
}

/**
 * El token del puente, comparado sin filtrar por temporizacion.
 *
 * Sin `ADMS_BRIDGE_TOKEN` configurado nadie es puente: los eventos de
 * dispositivo deciden por su cuenta si eso los frena o solo los avisa, porque
 * desplegar no puede dejar mudos a los checadores que ya operan.
 */
function isBridgeToken(offered: string | null): boolean {
  const expected = env.get('ADMS_BRIDGE_TOKEN')
  if (!expected || !offered) return false

  const a = Buffer.from(offered, 'utf8')
  const b = Buffer.from(String(expected), 'utf8')
  if (a.length !== b.length) return false

  return timingSafeEqual(a, b)
}

export default new Ws()
