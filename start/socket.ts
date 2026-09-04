import Ws from '#services/ws'
import AssistsService from '#services/assist_service'
import EmployeeBiometricService from '#services/employee_biometric_service'
import AccessPoint from '#models/access_point'
import AccessPointService from '#services/access_point_service'
import BusinessUnit from '#models/business_unit'
import i18nManager from '@adonisjs/i18n/services/main'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'

/**
 * Blindaje de `device-info` contra `uq_access_point_serial_number`
 * (USRH1787193625428). Solo se activa cuando el `create` de la rama de
 * alta choca contra el índice único; nunca se toca la rama de actualización
 * (`:491-521` de esta HU histórica) ni `accessPointName: payload.alias`.
 */
function isDuplicateSerialError(error: unknown): boolean {
  const err = error as { code?: string; errno?: number; message?: string } | undefined
  return (
    err?.code === 'ER_DUP_ENTRY' ||
    err?.errno === 1062 ||
    Boolean(err?.message?.includes('uq_access_point_serial_number'))
  )
}

Ws.boot()

/**
 * Listen for incoming socket connections
 */
if (Ws.io) {
  Ws.io.on('connection', (socket) => {

    socket.on('join-room', (_data) => {
      socket.join(`room-${_data.room}`)
    })

    /**
     * Handler para registrar un dispositivo ZKTeco cuando se conecta
     * El cliente debe emitir este evento con { serial_number: string }
     */
    socket.on('zk-device-register', (data) => {
      const serialNumber = data?.serial_number || data?.serialNumber
      if (serialNumber) {
        Ws.registerZkDeviceSocket(serialNumber, socket)
        socket.emit('zk-device-register-ack', { success: true, serial_number: serialNumber })
      } else {
        socket.emit('zk-device-register-ack', { success: false, error: 'serial_number es requerido' })
      }
    })

    /**
     * Handler para limpiar el registro cuando el dispositivo ZKTeco se desconecta
     */
    socket.on('disconnect', () => {
      // Buscar y eliminar este socket de los dispositivos registrados
      for (const [serialNumber, registeredSocket] of Ws.zkDeviceSockets) {
        if (registeredSocket.id === socket.id) {
          Ws.unregisterZkDeviceSocket(serialNumber)
          break
        }
      }
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
     * Handler para información de dispositivo (reloj checador / SpeedFace).
     * Registra o actualiza el punto de acceso (AccessPoint) usando serial_number como identificador único.
     * Si el dispositivo ya existe → actualiza. Si no existe → crea (requiere ACCESS_POINT_DEFAULT_BUSINESS_UNIT_ID en .env).
     */
    socket.on('device-info', async (data: {
      serial_number: string
      ip: string
      last_seen: string
      alias: string
      device_name: string
      firmware: string
      mac: string
      platform: string
      user_count: string
      event_type: string
      is_online: boolean
      active_employees_count: number
    }) => {
      try {
        const serialNumber = (data?.serial_number ?? '').toString().trim()
        if (!serialNumber) {
          socket.emit('device-info-ack', {
            success: false,
            error: 'serial_number es requerido',
          })
          return
        }

        const payload = {
          serial_number: serialNumber,
          ip: (data?.ip ?? '').toString().trim() || null,
          last_seen: (data?.last_seen ?? '').toString().trim() || null,
          alias: (data?.alias ?? '').toString().trim() || '',
          device_name: (data?.device_name ?? '').toString().trim() || null,
          firmware: (data?.firmware ?? '').toString().trim() || null,
          mac: (data?.mac ?? '').toString().trim() || null,
          platform: (data?.platform ?? '').toString().trim() || null,
          user_count: (data?.user_count ?? '').toString().trim() || '',
          event_type: (data?.event_type ?? '').toString().trim() || '',
          is_online: (data?.is_online ?? false),
        }

        const i18n = i18nManager.locale(i18nManager.defaultLocale)
        const accessPointService = new AccessPointService(i18n)
        const existing = await accessPointService.findBySerialNumber(serialNumber)

        const lastConnection = payload.last_seen
          ? DateTime.fromISO(payload.last_seen, { zone: 'utc' })
          : null

        if (existing) {
          // Actualizar dispositivo existente (serial_number no cambia)
          const updateData = {
            accessPointName: existing.accessPointName,
            businessUnitId: existing.businessUnitId,
            accessPointActive: existing.accessPointActive,
            accessPointSerialNumber: serialNumber,
            accessPointDeviceName: payload.device_name,
            accessPointIp: payload.ip,
            accessPointMac: payload.mac,
            accessPointFirmware: payload.firmware,
            accessPointPlatform: payload.platform,
            accessPointStatus: payload.is_online ? 1 : 0,
            accessPointLastConnection: lastConnection,
          } as AccessPoint
          const updated = await accessPointService.update(existing, updateData)
          if (Ws.io) {
            Ws.io.emit('device-info-received', {
              ...payload,
              accessPointId: updated.accessPointId,
              action: 'updated',
            })
          }
          socket.emit('device-info-ack', {
            success: true,
            serial_number: serialNumber,
            action: 'updated',
            accessPointId: updated.accessPointId,
          })
          // Resolver promesa pendiente de updateConnectionStatus si existía
          Ws.resolveZkDeviceInfo(serialNumber, { success: true, accessPoint: updated, action: 'updated' })
          return
        }

        // Dispositivo nuevo: usar la primera unidad de negocio existente
        const firstBusinessUnit = await BusinessUnit.query()
          .whereNull('business_unit_deleted_at')
          .orderBy('business_unit_id', 'asc')
          .first()
        if (!firstBusinessUnit?.businessUnitId) {
          socket.emit('device-info-ack', {
            success: false,
            error: 'No hay unidad de negocio registrada. Regístrela desde la API primero.',
            serial_number: serialNumber,
          })
          return
        }

        const newAccessPoint = {
          accessPointName: payload.alias || serialNumber,
          businessUnitId: firstBusinessUnit.businessUnitId,
          accessPointActive: 1,
          accessPointSerialNumber: serialNumber,
          accessPointDeviceName: payload.device_name,
          accessPointIp: payload.ip,
          accessPointMac: payload.mac,
          accessPointFirmware: payload.firmware,
          accessPointPlatform: payload.platform,
          accessPointStatus: 1,
          accessPointLastConnection: lastConnection,
        } as AccessPoint

        const verifyInfo = await accessPointService.verifyInfo(newAccessPoint)
        if (verifyInfo.status !== 200) {
          socket.emit('device-info-ack', {
            success: false,
            error: verifyInfo.message || i18n.formatMessage('entity_was_not_found', { entity: i18n.formatMessage('business_unit') }),
            serial_number: serialNumber,
          })
          return
        }

        let created: AccessPoint
        try {
          created = await accessPointService.create(newAccessPoint)
        } catch (createError) {
          if (!isDuplicateSerialError(createError)) {
            throw createError
          }

          logger.warn(
            { serialNumber, index: 'uq_access_point_serial_number' },
            'device-info: serie ya registrada, resolviendo choque'
          )

          // `AccessPoint.query()` compone SoftDeletes y filtra bajas por
          // defecto: se consulta en crudo para poder ver también la fila
          // muerta que secuestra la serie (CA-12).
          const occupant = await db
            .from('access_points')
            .where('access_point_serial_number', serialNumber)
            .first()

          if (occupant?.access_point_deleted_at) {
            // Ocupante muerto: libera la serie y reintenta una sola vez.
            await db
              .from('access_points')
              .where('access_point_id', occupant.access_point_id)
              .whereNotNull('access_point_deleted_at')
              .update({ access_point_serial_number: null })

            logger.warn(
              { serialNumber, freedAccessPointId: occupant.access_point_id },
              'device-info: serie liberada de una fila dada de baja, reintentando alta'
            )

            created = await accessPointService.create(newAccessPoint)
          } else {
            // Ocupante vivo: no se toca nada. Mensaje propio, nunca el del driver.
            logger.warn(
              { serialNumber, businessUnitId: occupant?.business_unit_id ?? null },
              'device-info: serie ya registrada en un punto de acceso vivo'
            )
            socket.emit('device-info-ack', {
              success: false,
              error: 'El número de serie ya está registrado en el sistema.',
              serial_number: serialNumber,
            })
            return
          }
        }

        if (Ws.io) {
          Ws.io.emit('device-info-received', {
            ...payload,
            accessPointId: created.accessPointId,
            action: 'created',
          })
        }
        socket.emit('device-info-ack', {
          success: true,
          serial_number: serialNumber,
          action: 'created',
          accessPointId: created.accessPointId,
        })
        // Resolver promesa pendiente de updateConnectionStatus si existía
        Ws.resolveZkDeviceInfo(serialNumber, { success: true, accessPoint: created, action: 'created' })
      } catch (error) {
        console.error('Error al procesar device-info:', error)
        socket.emit('device-info-ack', {
          success: false,
          error: error instanceof Error ? error.message : 'Error al procesar device-info',
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
