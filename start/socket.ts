import Ws from '#services/ws'
import AssistsService from '#services/assist_service'
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

        // Convertir punchTime a Date
        // El cliente ahora envía la fecha como string con zona horaria explícita (ej: "2026-02-04T12:54:00-06:00")
        // Esto evita que Socket.IO la convierta automáticamente a UTC
        let punchTimeDate: Date
        if (typeof punchTime === 'string') {
          // Si viene como string con zona horaria (ej: "2026-02-04T12:54:00-06:00")
          punchTimeDate = new Date(punchTime)
        } else if (punchTime instanceof Date) {
          punchTimeDate = punchTime
        } else {
          punchTimeDate = new Date(punchTime)
        }

        // Validar que la fecha sea válida
        if (Number.isNaN(punchTimeDate.getTime())) {
          socket.emit('register-assist-response', {
            success: false,
            error: 'punch_time debe ser una fecha válida',
          })
          return
        }

        // Registrar la asistencia
        const result = await assistsService.storeFromWebSocket(String(employeeSyncId), punchTimeDate)

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
  })
}
