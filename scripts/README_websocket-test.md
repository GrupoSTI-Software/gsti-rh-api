# Pruebas del Servicio WebSocket de Registro de Asistencias

Este directorio contiene scripts para probar el servicio WebSocket de registro de asistencias.

## 📋 Requisitos Previos

1. El servidor debe estar corriendo:
   ```bash
   npm run dev
   ```

2. La base de datos debe estar configurada y tener al menos un empleado con `employee_sync_id`.

3. Para el script Node.js, instala `socket.io-client`:
   ```bash
   npm install socket.io-client --save-dev
   ```

## 🚀 Métodos de Prueba

### Opción 1: Script Node.js (Terminal)

Ejecuta el script desde la terminal:

```bash
# Con valores por defecto (employee_sync_id: "12345", punch_time: ahora)
node scripts/test-websocket-assist.js

# Con employee_sync_id personalizado
node scripts/test-websocket-assist.js "TU_EMPLOYEE_SYNC_ID"

# Con employee_sync_id y fecha personalizada
node scripts/test-websocket-assist.js "TU_EMPLOYEE_SYNC_ID" "2024-01-15T10:30:00"

# Con URL personalizada del servidor
WS_URL=http://localhost:3333 node scripts/test-websocket-assist.js "TU_EMPLOYEE_SYNC_ID"
```

**Ejemplo de salida exitosa:**
```
🔌 Conectando al servidor WebSocket...
📍 URL: http://localhost:3333
👤 Employee Sync ID: 12345
🕐 Punch Time: 2024-01-15T10:30:00.000Z

✅ Conectado al servidor WebSocket
📡 Socket ID: abc123xyz

📤 Enviando solicitud de registro de asistencia...
📥 Respuesta recibida:
{
  "success": true,
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Asistencia registrada exitosamente"
}

✅ Éxito!
🆔 UUID generado: 550e8400-e29b-41d4-a716-446655440000
💬 Mensaje: Asistencia registrada exitosamente
```

### Opción 2: Interfaz Web (Navegador)

1. Abre el archivo `scripts/test-websocket-assist.html` en tu navegador:
   ```bash
   # En macOS
   open scripts/test-websocket-assist.html

   # En Linux
   xdg-open scripts/test-websocket-assist.html

   # O simplemente arrastra el archivo al navegador
   ```

2. Completa los campos:
   - **URL del Servidor**: Por defecto `http://localhost:3333`
   - **Employee Sync ID**: El ID de sincronización del empleado
   - **Punch Time**: Fecha y hora de la asistencia

3. Haz clic en "Conectar y Probar"

4. Verás la respuesta en la caja de respuesta debajo del formulario

## 📡 Eventos WebSocket

### Evento: `register-assist`

**Emitido por el cliente:**

```javascript
socket.emit('register-assist', {
  employee_sync_id: '12345',  // string, requerido
  punch_time: new Date()       // Date o string de fecha válido, requerido
})
```

### Evento: `register-assist-response`

**Recibido por el cliente que hizo la solicitud:**

**Respuesta exitosa:**
```javascript
{
  success: true,
  uuid: "550e8400-e29b-41d4-a716-446655440000",
  message: "Asistencia registrada exitosamente"
}
```

**Respuesta con error:**
```javascript
{
  success: false,
  error: "Mensaje de error descriptivo"
}
```

### Evento: `assist-registered` (Broadcast)

**Recibido por TODOS los clientes conectados cuando se registra una asistencia exitosamente:**

```javascript
{
  uuid: "550e8400-e29b-41d4-a716-446655440000",
  employeeSyncId: "12345",
  employeeCode: "EMP001",
  employeeId: 42,
  punchTime: "2024-01-15T10:30:00.000Z",
  timestamp: "2024-01-15T10:30:05.123Z"
}
```

**Nota:** Este evento se emite a todos los clientes conectados, no solo al que hizo la solicitud. Esto permite notificaciones en tiempo real cuando otros clientes registran asistencias.

## 🧪 Casos de Prueba

### Caso 1: Registro exitoso
- ✅ Empleado existe en la base de datos
- ✅ `employee_sync_id` es válido
- ✅ `punch_time` es una fecha válida

### Caso 2: Empleado no encontrado
- ❌ `employee_sync_id` no existe en la base de datos
- **Respuesta esperada**: `{ success: false, error: "Empleado no encontrado..." }`

### Caso 3: Datos faltantes
- ❌ Falta `employee_sync_id`
- **Respuesta esperada**: `{ success: false, error: "employee_sync_id es requerido" }`

- ❌ Falta `punch_time`
- **Respuesta esperada**: `{ success: false, error: "punch_time es requerido" }`

### Caso 4: Fecha inválida
- ❌ `punch_time` no es una fecha válida
- **Respuesta esperada**: `{ success: false, error: "punch_time debe ser una fecha válida" }`

## 🔍 Verificación en Base de Datos

Después de una prueba exitosa, puedes verificar el registro en la base de datos:

```sql
SELECT 
  assist_id,
  assist_uuid,
  assist_emp_code,
  assist_emp_id,
  assist_punch_time,
  assist_punch_time_utc,
  assist_punch_time_origin,
  assist_created_at
FROM assists
WHERE assist_uuid = 'TU_UUID_AQUI'
ORDER BY assist_created_at DESC
LIMIT 1;
```

## 🐛 Solución de Problemas

### Error: "Cannot find module 'socket.io-client'"
```bash
npm install socket.io-client --save-dev
```

### Error: "Connection refused" o "ECONNREFUSED"
- Verifica que el servidor esté corriendo (`npm run dev`)
- Verifica que el puerto sea correcto (por defecto 3333)
- Verifica que no haya un firewall bloqueando la conexión

### Error: "Empleado no encontrado"
- Verifica que el `employee_sync_id` exista en la tabla `employees`
- Verifica que el empleado no esté eliminado (`employee_deleted_at IS NULL`)

### El script se cuelga sin respuesta
- Verifica los logs del servidor para ver si hay errores
- Verifica que la migración del campo `assist_uuid` se haya ejecutado
- Verifica que la base de datos esté accesible

## 📝 Notas

- El UUID se genera automáticamente usando `crypto.randomUUID()`
- La fecha se convierte automáticamente a UTC antes de guardarse
- Los campos opcionales se establecen con valores por defecto (strings vacíos, 0 para números)
- El servicio actualiza automáticamente el calendario de sincronización después de registrar la asistencia

## 🔔 Notificaciones en Tiempo Real

Cuando múltiples clientes están conectados:

1. **Cada cliente debe conectarse independientemente** - Cada tab/navegador es una conexión separada
2. **Respuesta individual** - El cliente que registra la asistencia recibe `register-assist-response`
3. **Notificación broadcast** - TODOS los clientes conectados reciben `assist-registered` cuando se registra exitosamente una asistencia

**Ejemplo de uso con múltiples tabs:**

1. Abre dos tabs del archivo HTML
2. Conecta ambas tabs al servidor
3. En la Tab 1, registra una asistencia
4. La Tab 1 recibirá `register-assist-response` (su respuesta individual)
5. La Tab 2 recibirá `assist-registered` (notificación de que otro cliente registró una asistencia)
6. Ambas tabs verán las notificaciones en tiempo real
