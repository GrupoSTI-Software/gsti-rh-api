import Ws from '#services/ws'
import AssistsService from '#services/assist_service'
import EmployeeBiometricService from '#services/employee_biometric_service'
import i18nManager from '@adonisjs/i18n/services/main'

Ws.boot()

/**
 * Listen for incoming socket connections
 */
if (Ws.io) {
  Ws.io.on('connection', (socket) => {

    socket.on('join-room', (_data) => {
      socket.join(`room-${_data.room}`)
    })

    // Log para depuración: registrar todos los eventos recibidos
    const originalEmit = socket.emit.bind(socket)
    socket.emit = function (event: string, ...args: any[]) {
      return originalEmit(event, ...args)
    }

    /**
     * Handler para registrar asistencia mediante WebSocket
     * Recibe: { employee_sync_id: string, punch_time: Date }
     * Responde: { success: boolean, uuid?: string, error?: string }
     */
    socket.on('register-assist', async (data) => {
      try {
        // Extraer datos del payload (el cliente envía snake_case, los convertimos a camelCase)
        const employeeSyncId = data.employee_sync_id || data.employeeSyncId
        const punchTime = data.punch_time || data.punchTime

        // Validar que se recibieron los datos necesarios
        if (!employeeSyncId) {
          socket.emit('register-assist-response', {
            success: false,
            error: 'employee_sync_id es requerido',
          })
          return
        }

        if (!punchTime) {
          socket.emit('register-assist-response', {
            success: false,
            error: 'punch_time es requerido',
          })
          return
        }

        // Crear instancia de I18n con locale por defecto
        const i18n = i18nManager.locale(i18nManager.defaultLocale)
        const assistsService = new AssistsService(i18n)
        let punchTimeDate = punchTime

        // Registrar la asistencia
        const result = await assistsService.storeFromWebSocket(String(employeeSyncId), punchTimeDate, data.device_sn, data.device_alias)

        if (!result) {
          socket.emit('register-assist-response', {
            success: false,
            error: 'Empleado no encontrado con el employee_sync_id proporcionado',
          })
          return
        }

        // Enviar respuesta exitosa con el UUID al cliente que hizo la solicitud
        socket.emit('register-assist-response', {
          success: true,
          uuid: result.uuid,
          message: 'Asistencia registrada exitosamente',
        })

        // Notificar a todos los clientes conectados sobre el nuevo registro
        if (Ws.io) {
          Ws.io.emit('assist-registered', {
            uuid: result.uuid,
            employeeSyncId: employeeSyncId,
            employeeCode: result.assist.assistEmpCode,
            employeeId: result.assist.assistEmpId,
            punchTime: result.assist.assistPunchTime,
            timestamp: new Date().toISOString(),
          })
        }
      } catch (error) {
        console.error('Error al registrar asistencia mediante WebSocket:', error)
        socket.emit('register-assist-response', {
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido al registrar asistencia',
        })
      }
    })

    /**
     * PASO 1: Handler para iniciar enrolamiento biométrico
     * Recibe: { employee_id: number, biometric_type: 'finger' | 'face', finger_ids?: number[] (0-9) }
     *         También acepta finger_id (número único) para compatibilidad hacia atrás
     * Responde: { success: boolean, message?: string, error?: string }
     */
    socket.on('start-biometric-enrollment', async (data) => {
      try {
        const employeeId = data.employee_id !== undefined ? data.employee_id : data.employeeId
        const biometricType = data.biometric_type || data.biometricType
        const removeFace = data.remove_face !== undefined ? data.remove_face : data.removeFace || false
        // Aceptar tanto finger_ids (array) como finger_id (número único) para compatibilidad
        let fingerIds: number[] | undefined
        if (data.finger_ids !== undefined || data.fingerIds !== undefined) {
          fingerIds = Array.isArray(data.finger_ids) ? data.finger_ids : data.fingerIds
        } else if (data.finger_id !== undefined || data.fingerId !== undefined) {
          // Compatibilidad: convertir finger_id único a array
          const singleFingerId = data.finger_id !== undefined ? data.finger_id : data.fingerId
          fingerIds = [Number(singleFingerId)]
        }

        // Validaciones
        if (employeeId === undefined || employeeId === null) {
          socket.emit('start-biometric-enrollment-response', {
            success: false,
            error: 'employee_id es requerido',
          })
          return
        }

        const employeeIdNumber = Number(employeeId)
        if (Number.isNaN(employeeIdNumber) || employeeIdNumber <= 0) {
          socket.emit('start-biometric-enrollment-response', {
            success: false,
            error: 'employee_id debe ser un número válido mayor a 0',
          })
          return
        }

        if (!biometricType || (biometricType !== 'finger' && biometricType !== 'face')) {
          socket.emit('start-biometric-enrollment-response', {
            success: false,
            error: 'biometric_type debe ser "finger" o "face"',
          })
          return
        }

        if (biometricType === 'finger') {
          // Permitir array vacío para eliminar todos los fingers
          if (fingerIds === undefined || fingerIds === null) {
            socket.emit('start-biometric-enrollment-response', {
              success: false,
              error: 'finger_ids es requerido cuando biometric_type es "finger" (puede ser un array vacío para eliminar todos)',
            })
            return
          }

          if (!Array.isArray(fingerIds)) {
            socket.emit('start-biometric-enrollment-response', {
              success: false,
              error: 'finger_ids debe ser un array',
            })
            return
          }

          // Si hay valores en el array, validar que todos estén en el rango correcto
          if (fingerIds.length > 0) {
            const invalidFingers = fingerIds.filter((f) => typeof f !== 'number' || f < 0 || f > 9)
            if (invalidFingers.length > 0) {
              socket.emit('start-biometric-enrollment-response', {
                success: false,
                error: 'Todos los valores en finger_ids deben ser números entre 0 y 9',
              })
              return
            }
          }
          // Si el array está vacío, se permite (para eliminar todos los fingers)
        }

        // Crear instancia de I18n y servicio
        const i18n = i18nManager.locale(i18nManager.defaultLocale)
        const biometricService = new EmployeeBiometricService(i18n)

        // Iniciar enrolamiento
        const result = await biometricService.startEnrollment(
          employeeIdNumber,
          biometricType,
          biometricType === 'finger' ? fingerIds : undefined,
          biometricType === 'face' ? (removeFace || false) : undefined
        )

        if (!result) {
          socket.emit('start-biometric-enrollment-response', {
            success: false,
            error: 'Empleado no encontrado con el employee_id proporcionado',
          })
          return
        }

        // Crear mensaje descriptivo
        let message = `Enrolamiento de ${biometricType}`
        if (biometricType === 'finger') {
          if (result.fingerIds && result.fingerIds.length > 0) {
            const leftHand = result.fingerIds.filter((f) => f >= 0 && f <= 4)
            const rightHand = result.fingerIds.filter((f) => f >= 5 && f <= 9)
            const parts: string[] = []
            if (leftHand.length > 0) {
              parts.push(`mano izquierda: dedos [${leftHand.join(', ')}]`)
            }
            if (rightHand.length > 0) {
              parts.push(`mano derecha: dedos [${rightHand.join(', ')}]`)
            }
            message += ` (${parts.join(', ')})`
          } else {
            message += ' (eliminando todos los fingers)'
          }
        } else if (biometricType === 'face') {
          if (removeFace) {
            message += ' (eliminando Face ID)'
          } else {
            message += ' (agregando Face ID)'
          }
        }

        // Enviar respuesta exitosa
        socket.emit('start-biometric-enrollment-response', {
          success: true,
          message: `${message} iniciado`,
          employeeId: result.employeeId,
          biometricType: result.biometricType,
          fingerIds: result.fingerIds,
          status: result.status,
        })

        // Notificar al dispositivo (si está conectado en una sala específica)
        if (Ws.io) {
          Ws.io.to(`device-${employeeIdNumber}`).emit('enrollment-started', {
            employeeId: result.employeeId,
            biometricType: result.biometricType,
            fingerIds: result.fingerIds,
          })
        }
      } catch (error) {
        console.error('Error al iniciar enrolamiento biométrico:', error)
        socket.emit('start-biometric-enrollment-response', {
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido al iniciar enrolamiento',
        })
      }
    })

    /**
     * PASO 2: Handler para recibir estatus de enrolamiento desde el dispositivo
     * Solo actualiza el status a 'completed' o 'failed', no modifica los datos biométricos
     * Recibe: { employee_id: number, status?: 'completed' | 'failed' }
     * Responde: { success: boolean, message?: string, error?: string }
     */
    socket.on('biometric-enrollment-status', async (data) => {
      try {
        const employeeId = data.employee_id !== undefined ? data.employee_id : data.employeeId
        const status = data.status || 'completed'

        // Validaciones
        if (employeeId === undefined || employeeId === null) {
          socket.emit('biometric-enrollment-status-response', {
            success: false,
            error: 'employee_id es requerido',
          })
          return
        }

        const employeeIdNumber = Number(employeeId)
        if (Number.isNaN(employeeIdNumber) || employeeIdNumber <= 0) {
          socket.emit('biometric-enrollment-status-response', {
            success: false,
            error: 'employee_id debe ser un número válido mayor a 0',
          })
          return
        }

        if (status !== 'completed' && status !== 'failed' && status !== 'completed_fingers' && status !== 'completed_face' && status !== 'completed_both') {
          socket.emit('biometric-enrollment-status-response', {
            success: false,
            error: 'status debe ser "completed", "failed", "completed_fingers", "completed_face" o "completed_both"',
          })
          return
        }

        // Crear instancia de I18n y servicio
        const i18n = i18nManager.locale(i18nManager.defaultLocale)
        const biometricService = new EmployeeBiometricService(i18n)

        // Actualizar solo el status (mantiene los datos biométricos existentes)
        const result = await biometricService.updateEnrollmentStatus(employeeIdNumber, status)

        if (!result) {
          socket.emit('biometric-enrollment-status-response', {
            success: false,
            error: 'Empleado o registro biométrico no encontrado con el employee_id proporcionado',
          })
          return
        }

        // Determinar mensaje según el status específico
        let statusMessage = 'fallido'
        if (result.status === 'completed_fingers') {
          statusMessage = 'completado (solo fingers)'
        } else if (result.status === 'completed_face') {
          statusMessage = 'completado (solo face)'
        } else if (result.status === 'completed_both') {
          statusMessage = 'completado (ambos)'
        } else if (result.status === 'failed') {
          statusMessage = 'fallido'
        }

        // Enviar respuesta exitosa
        socket.emit('biometric-enrollment-status-response', {
          success: true,
          message: `Enrolamiento ${statusMessage} exitosamente`,
          employeeId: result.employeeId,
          fingers: result.fingers,
          face: result.face,
          status: result.status,
          biometricData: result.biometricData,
        })

        // Notificar a todos los clientes conectados sobre el cambio de status
        if (Ws.io) {
          Ws.io.emit('biometric-enrollment-updated', {
            employeeId: result.employeeId,
            fingers: result.fingers,
            face: result.face,
            status: result.status,
            biometricData: result.biometricData,
            timestamp: new Date().toISOString(),
          })
        }
      } catch (error) {
        console.error('Error al actualizar estatus de enrolamiento:', error)
        socket.emit('biometric-enrollment-status-response', {
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido al actualizar estatus',
        })
      }
    })

    /**
     * PASO 3: Handler para solicitar estatus de biométricos al dispositivo
     * Se ejecuta automáticamente cuando un dispositivo se conecta
     * También puede ser llamado manualmente: { employee_id: number }
     * Responde: { success: boolean, status?: string, fingers?: number[], face?: boolean, error?: string }
     */
    socket.on('request-biometric-status', async (data) => {
      try {
        const employeeId = data?.employee_id !== undefined ? data.employee_id : data?.employeeId

        if (employeeId === undefined || employeeId === null) {
          socket.emit('biometric-status-response', {
            success: false,
            error: 'employee_id es requerido',
          })
          return
        }

        const employeeIdNumber = Number(employeeId)
        if (Number.isNaN(employeeIdNumber) || employeeIdNumber <= 0) {
          socket.emit('biometric-status-response', {
            success: false,
            error: 'employee_id debe ser un número válido mayor a 0',
          })
          return
        }

        // Crear instancia de I18n y servicio
        const i18n = i18nManager.locale(i18nManager.defaultLocale)
        const biometricService = new EmployeeBiometricService(i18n)

        // Obtener status actual
        const result = await biometricService.getEnrollmentStatus(employeeIdNumber)

        if (!result) {
          socket.emit('biometric-status-response', {
            success: false,
            error: 'Empleado no encontrado con el employee_id proporcionado',
          })
          return
        }

        // Enviar respuesta con el status actual
        // biometricData contiene el formato string de la BD: "Finger:0, Finger:6, Face"
        socket.emit('biometric-status-response', {
          success: true,
          employeeId: result.employeeId,
          status: result.status,
          fingers: result.fingers,
          face: result.face,
          biometricData: result.biometricData || '', // Formato: "Finger:0, Finger:6, Face"
        })

        // También solicitar al dispositivo que envíe su status actual
        if (Ws.io) {
          Ws.io.to(`device-${employeeIdNumber}`).emit('request-device-biometric-status', {
            employeeId: result.employeeId,
          })
        }
      } catch (error) {
        console.error('Error al solicitar estatus biométrico:', error)
        socket.emit('biometric-status-response', {
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido al solicitar estatus',
        })
      }
    })

    /**
     * Cuando un dispositivo se conecta, automáticamente solicitar su status
     * Esto permite sincronizar el estado al conectar
     */
    socket.on('device-connected', async (data) => {
      try {
        const employeeId = data?.employee_id !== undefined ? data.employee_id : data?.employeeId

        if (employeeId !== undefined && employeeId !== null) {
          const employeeIdNumber = Number(employeeId)
          if (!Number.isNaN(employeeIdNumber) && employeeIdNumber > 0) {
            // Unirse a la sala del dispositivo
            socket.join(`device-${employeeIdNumber}`)

            // Solicitar status automáticamente
            const i18n = i18nManager.locale(i18nManager.defaultLocale)
            const biometricService = new EmployeeBiometricService(i18n)
            const result = await biometricService.getEnrollmentStatus(employeeIdNumber)

            if (result) {
              socket.emit('biometric-status-response', {
                success: true,
                employeeId: result.employeeId,
                status: result.status,
                fingers: result.fingers,
                face: result.face,
                biometricData: result.biometricData || '', // Formato: "Finger:0, Finger:6, Face"
              })
            } else {
              // Si no hay registro, devolver status pending con string vacío
              socket.emit('biometric-status-response', {
                success: true,
                employeeId: employeeIdNumber,
                status: 'pending',
                fingers: [],
                face: false,
                biometricData: '',
              })
            }
          }
        }
      } catch (error) {
        console.error('Error al manejar conexión de dispositivo:', error)
      }
    })
  })
}
