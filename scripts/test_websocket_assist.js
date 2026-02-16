/**
 * Script de prueba para el servicio WebSocket de registro de asistencias
 *
 * Uso:
 *   node scripts/test-websocket-assist.js [employee_sync_id] [punch_time]
 *
 * Ejemplos:
 *   node scripts/test-websocket-assist.js "12345"
 *   node scripts/test-websocket-assist.js "12345" "2024-01-15T10:30:00"
 */

import { io } from 'socket.io-client'

const SERVER_URL = process.env.WS_URL || 'http://localhost:3333'
const EMPLOYEE_SYNC_ID = process.argv[2] || '12345'
const PUNCH_TIME = process.argv[3] ? new Date(process.argv[3]) : new Date()

// Crear conexión WebSocket
const socket = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
})

socket.on('connect', () => {

  // Emitir evento de registro de asistencia
  // IMPORTANTE: Enviamos la fecha como string con zona horaria explícita
  // Formato: YYYY-MM-DDTHH:mm:ss-06:00 (México UTC-6)
  const year = PUNCH_TIME.getFullYear()
  const month = String(PUNCH_TIME.getMonth() + 1).padStart(2, '0')
  const day = String(PUNCH_TIME.getDate()).padStart(2, '0')
  const hours = String(PUNCH_TIME.getHours()).padStart(2, '0')
  const minutes = String(PUNCH_TIME.getMinutes()).padStart(2, '0')
  const seconds = String(PUNCH_TIME.getSeconds()).padStart(2, '0')
  const punchTimeString = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-06:00`

  socket.emit('register-assist', {
    employee_sync_id: EMPLOYEE_SYNC_ID,
    punch_time: punchTimeString, // Enviamos como string con zona horaria
  })
})

socket.on('register-assist-response', (response) => {

  socket.disconnect()
  process.exit(response.success ? 0 : 1)
})

socket.on('connect_error', (error) => {
  console.error('❌ Error de conexión:', error.message)
  console.error('')
  console.error('💡 Asegúrate de que:')
  console.error('   1. El servidor está corriendo (npm run dev)')
  console.error('   2. El puerto es correcto (por defecto 3333)')
  console.error('   3. La URL del servidor es correcta')
  process.exit(1)
})

socket.on('disconnect', (reason) => {
  console.warn(`🔌 Desconectado: ${reason}`)
})

// Timeout de seguridad
setTimeout(() => {
  console.error('⏱️  Timeout: No se recibió respuesta en 10 segundos')
  socket.disconnect()
  process.exit(1)
}, 10000)
