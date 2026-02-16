# 🔧 Corrección: Challenge Mismatch en Autenticación con Passkey

## 🔴 Problema Original

```
"Unexpected authentication response challenge \"r3MojNOk2KwOTc0AZy59dgTmC6NE1OaABzGTxfYIpXk\", 
expected \"oGb5uZwejXAqpYmNASauPDcFpSvxOEBbILtIlrbgwZ0\""
```

### Causa Raíz

El sistema anterior guardaba un solo challenge por email usando claves como `login:email@ejemplo.com`. Si el usuario:

1. Hace clic en "Iniciar con Biometría" → Se genera `challenge_1` y se guarda
2. Cancela el diálogo de WebAuthn
3. Hace clic nuevamente → Se genera `challenge_2` que **sobrescribe** `challenge_1`
4. Completa la autenticación → El navegador envía una credencial con `challenge_1` en el `clientDataJSON`
5. El backend busca en el caché y encuentra `challenge_2`
6. ❌ **Error**: Los challenges no coinciden

### Problema de Diseño Anterior

```typescript
// ❌ ANTES: Un solo challenge por email
const cacheKey = `login:${email}`
challengeCache.set(cacheKey, {
  challenge: options.challenge, // Se sobrescribe en cada llamada
  email,
  createdAt: Date.now(),
})
```

---

## ✅ Solución Implementada

### Cambio Principal: Usar el Challenge como Clave

En lugar de usar el email como clave única, ahora usamos el **propio challenge** como clave. Esto permite:
- ✅ Múltiples challenges activos simultáneamente por email
- ✅ El challenge correcto siempre se encuentra
- ✅ No hay sobrescritura de challenges

### 1. Nueva Interfaz de ChallengeData

```typescript
interface ChallengeData {
  challenge: string
  email: string
  type: 'register' | 'login' // ✅ Nuevo: tipo de operación
  createdAt: number
}
```

### 2. Nueva Función: Extraer Challenge del ClientDataJSON

```typescript
/**
 * Extrae el challenge del clientDataJSON de una credencial
 */
function extractChallengeFromClientData(clientDataJSON: string): string | null {
  try {
    // Decodificar base64url a string
    const jsonString = Buffer.from(clientDataJSON, 'base64url').toString('utf-8')
    const clientData = JSON.parse(jsonString)
    return clientData.challenge || null
  } catch (error) {
    console.error('Error al extraer challenge:', error)
    return null
  }
}
```

Esta función decodifica el `clientDataJSON` que viene en la credencial y extrae el challenge original que se usó para generar la credencial.

### 3. Guardado de Challenge (Register y Login Options)

```typescript
// ✅ AHORA: Usar el challenge como clave única
const cacheKey = `challenge:${options.challenge}`
challengeCache.set(cacheKey, {
  challenge: options.challenge,
  email: email || '',
  type: 'register', // o 'login' según el endpoint
  createdAt: Date.now(),
})
```

### 4. Búsqueda de Challenge (Register y Login Complete)

```typescript
// Extraer el challenge del clientDataJSON de la credencial
const challengeFromClient = extractChallengeFromClientData(
  credential.response.clientDataJSON
)

if (!challengeFromClient) {
  return response.status(400).json({
    type: 'error',
    title: 'Challenge inválido',
    message: 'No se pudo extraer el challenge de la credencial',
  })
}

// Buscar en el caché usando el challenge extraído
const cacheKey = `challenge:${challengeFromClient}`
const challengeData = challengeCache.get(cacheKey)

if (!challengeData) {
  return response.status(400).json({
    type: 'error',
    title: 'Challenge no encontrado',
    message: 'El challenge ha expirado o no existe.',
  })
}

// Validar tipo de operación
if (challengeData.type !== 'login') { // o 'register'
  return response.status(400).json({
    type: 'error',
    title: 'Challenge inválido',
    message: 'El challenge no corresponde a esta operación',
  })
}

// Verificar con el challenge correcto
const verification = await verifyAuthenticationResponse({
  response: credential,
  expectedChallenge: challengeData.challenge, // ✅ Siempre el correcto
  // ...
})

// Eliminar después de usar (uso único)
challengeCache.delete(cacheKey)
```

---

## 🔄 Flujo Completo Ahora

### Registro de Passkey

1. **Frontend**: Llama a `/api/auth/passkey/register/options` con `{ email }`
2. **Backend**: 
   - Genera `challenge_A` (ej: `"abc123..."`)
   - Guarda en caché: `challenge:abc123 → { challenge: "abc123", email, type: "register" }`
   - Devuelve las opciones con `challenge: "abc123"`
3. **Frontend**: El usuario completa el registro biométrico
4. **Frontend**: Llama a `/api/auth/passkey/register/complete` con la credencial
5. **Backend**:
   - Extrae el challenge del `clientDataJSON`: `"abc123"`
   - Busca en caché: `challenge:abc123`
   - ✅ Encuentra el challenge correcto
   - Verifica la credencial
   - Elimina el challenge del caché
   - Guarda la Passkey en la BD

### Login con Passkey (Con Cancelaciones)

1. **Frontend**: Llama a `/api/auth/passkey/login/options` con `{ email }`
2. **Backend**: 
   - Genera `challenge_1`: `"xyz789"`
   - Guarda: `challenge:xyz789 → { challenge: "xyz789", email, type: "login" }`
3. **Frontend**: Usuario cancela el diálogo
4. **Frontend**: Usuario hace clic de nuevo, llama a `/options` otra vez
5. **Backend**:
   - Genera `challenge_2`: `"def456"`
   - Guarda: `challenge:def456 → { challenge: "def456", email, type: "login" }`
   - ✅ **IMPORTANTE**: `challenge_1` sigue en el caché (no se sobrescribe)
6. **Frontend**: Usuario cancela de nuevo
7. **Frontend**: Usuario hace clic por tercera vez
8. **Backend**:
   - Genera `challenge_3`: `"ghi789"`
   - Guarda: `challenge:ghi789 → { challenge: "ghi789", email, type: "login" }`
   - ✅ Ahora hay 3 challenges activos en el caché
9. **Frontend**: Usuario completa la autenticación con `challenge_3`
10. **Backend**:
    - Extrae challenge del `clientDataJSON`: `"ghi789"`
    - Busca: `challenge:ghi789`
    - ✅ Encuentra el challenge correcto
    - Verifica la firma
    - Elimina `challenge:ghi789` del caché
    - Genera y devuelve el token de acceso

---

## 🆚 Comparación: Antes vs Ahora

### ANTES ❌

```typescript
// Guardado
challengeCache.set(`login:${email}`, { challenge: "abc123" })

// Usuario cancela y reintenta
challengeCache.set(`login:${email}`, { challenge: "xyz789" }) // ❌ Sobrescribe

// Búsqueda
const data = challengeCache.get(`login:${email}`) // Encuentra "xyz789"
// Pero el clientDataJSON tiene "abc123"
// ❌ ERROR: Mismatch
```

### AHORA ✅

```typescript
// Guardado (intento 1)
challengeCache.set(`challenge:abc123`, { challenge: "abc123", email, type: "login" })

// Usuario cancela y reintenta (intento 2)
challengeCache.set(`challenge:xyz789`, { challenge: "xyz789", email, type: "login" })
// ✅ "abc123" todavía existe en el caché

// Usuario completa con challenge "abc123"
const challengeFromClient = extractChallengeFromClientData(credential.response.clientDataJSON)
// challengeFromClient = "abc123"

const data = challengeCache.get(`challenge:${challengeFromClient}`)
// ✅ Encuentra "abc123" correctamente
// ✅ Verificación exitosa
```

---

## 🔒 Seguridad Mejorada

### 1. Validación de Tipo de Operación
```typescript
if (challengeData.type !== 'login') {
  return response.status(400).json({
    type: 'error',
    message: 'El challenge no corresponde a esta operación',
  })
}
```

Esto previene:
- ❌ Usar un challenge de registro para hacer login
- ❌ Usar un challenge de login para hacer registro

### 2. Uso Único
El challenge se elimina inmediatamente después de ser usado:
```typescript
challengeCache.delete(cacheKey)
```

### 3. Expiración Automática
Los challenges expiran después de 5 minutos:
```typescript
if (now - data.createdAt > FIVE_MINUTES) {
  challengeCache.delete(key)
}
```

---

## 📊 Ventajas del Nuevo Sistema

| Aspecto | Antes ❌ | Ahora ✅ |
|---------|---------|---------|
| Múltiples challenges por email | No (se sobrescribe) | Sí (cada uno con su clave) |
| Reintentos sin error | No | Sí |
| Búsqueda precisa | Por email (puede fallar) | Por challenge (siempre correcto) |
| Validación de tipo | No | Sí (register vs login) |
| Complejidad | Alta (múltiples fallbacks) | Baja (búsqueda directa) |
| Rendimiento | Peor (iterar en caché) | Mejor (acceso O(1)) |

---

## 🧪 Cómo Probarlo

### Escenario 1: Login Normal (Sin Cancelaciones)

1. Abre `http://localhost:4200`
2. Escribe tu email
3. Haz clic en "Iniciar con Biometría"
4. Completa el desafío biométrico
5. ✅ Login exitoso

### Escenario 2: Login con Cancelaciones (El Problema Original)

1. Abre `http://localhost:4200`
2. Escribe tu email
3. Haz clic en "Iniciar con Biometría"
4. **Cancela** el diálogo de WebAuthn
5. Haz clic en "Iniciar con Biometría" **nuevamente**
6. **Cancela** otra vez
7. Haz clic por **tercera vez**
8. Ahora **completa** el desafío biométrico
9. ✅ Login exitoso (antes fallaba aquí)

### Escenario 3: Múltiples Pestañas

1. Abre `http://localhost:4200` en la pestaña A
2. Abre `http://localhost:4200` en la pestaña B
3. En la pestaña A: Haz clic en "Iniciar con Biometría"
4. En la pestaña B: Haz clic en "Iniciar con Biometría"
5. En la pestaña A: Completa el desafío
6. ✅ Login exitoso en A
7. En la pestaña B: Completa el desafío
8. ✅ Login exitoso en B

---

## 🚀 Mejoras Futuras (Producción)

### 1. Usar Redis con TTL Automático
```typescript
await redis.setex(`passkey:challenge:${challenge}`, 300, JSON.stringify(data))
```

### 2. Logging Estructurado
```typescript
logger.info('Challenge generado', {
  challenge: challenge.substring(0, 10) + '...',
  email,
  type: 'login',
  timestamp: new Date().toISOString()
})
```

### 3. Métricas
```typescript
metrics.increment('passkey.challenge.created', { type: 'login' })
metrics.increment('passkey.challenge.used', { type: 'login' })
metrics.increment('passkey.challenge.expired', { type: 'login' })
```

### 4. Limitar Challenges por Email
```typescript
const challengesForEmail = Array.from(challengeCache.values())
  .filter(c => c.email === email && c.type === 'login')

if (challengesForEmail.length >= MAX_CHALLENGES_PER_EMAIL) {
  // Limpiar los más antiguos
}
```

---

## ✅ Archivos Modificados

1. `app/controllers/passkey_controller.ts`
   - Agregada función `extractChallengeFromClientData`
   - Modificado almacenamiento de challenges (usar challenge como clave)
   - Modificada búsqueda en `registerComplete` y `loginComplete`
   - Agregada validación de tipo de operación
   - Simplificada lógica de búsqueda (sin fallbacks complejos)

---

## 🎉 Resultado

El error **"Unexpected authentication response challenge"** está completamente resuelto. El sistema ahora:

✅ Soporta múltiples intentos sin errores  
✅ Maneja cancelaciones correctamente  
✅ Funciona con múltiples pestañas  
✅ Es más simple y mantenible  
✅ Es más seguro (validación de tipo)  
✅ Tiene mejor rendimiento (búsqueda O(1))
