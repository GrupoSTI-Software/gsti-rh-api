# 🔐 Sistema de Caché de Challenges para Passkeys

## 📋 Problema Resuelto

El error que estabas experimentando:
```
"Unexpected registration response challenge \"yVpinO8yhB_E4n-IwzFTG_ozcH2WJOA6UVyzxOlE7TM\", 
expected \"eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hhbGxlbmdlIjoieVZwaW5POHloQl9FNG4tSXd6RlRHX296Y0gyV0pPQTZVVnl6eE9sRTdUTSIsIm9yaWdpbiI6Imh0dHBzOi8vbG9jYWxob3N0OjQyMDAiLCJjcm9zc09yaWdpbiI6ZmFsc2V9\""
```

**Causa**: El backend estaba intentando verificar el `clientDataJSON` completo en lugar del `challenge` original que se generó en `/register/options`.

**Solución**: Implementé un sistema de caché en memoria que almacena temporalmente los challenges generados y los recupera durante la verificación.

---

## 🏗️ Arquitectura de la Solución

### 1. Caché en Memoria

```typescript
interface IChallengeData {
  challenge: string
  email: string
  createdAt: number
}

const challengeCache = new Map<string, IChallengeData>()
```

**Características**:
- Almacena challenges temporalmente en memoria
- Cada challenge expira automáticamente después de 5 minutos
- Se limpia automáticamente cada 5 minutos para evitar fugas de memoria

### 2. Formato de Claves

Para diferenciar challenges de registro y login, se usan prefijos:

- **Registro**: `register:${email}`
  - Ejemplo: `register:user@ejemplo.com`

- **Login**: `login:${email}`
  - Ejemplo: `login:user@ejemplo.com`

---

## 🔄 Flujo de Registro

### 1. Cliente solicita opciones de registro

**Endpoint**: `POST /api/auth/passkey/register/options`

```json
{
  "email": "user@ejemplo.com"
}
```

**Proceso Backend**:
1. Genera opciones de registro con `generateRegistrationOptions()`
2. **Guarda el challenge en caché** con clave `register:user@ejemplo.com`
3. Devuelve las opciones al cliente

```typescript
const options = await generateRegistrationOptions({ ... })

challengeCache.set(`register:${email}`, {
  challenge: options.challenge,
  email,
  createdAt: Date.now(),
})

return response.json(options)
```

### 2. Cliente completa el registro

**Endpoint**: `POST /api/auth/passkey/register/complete`

```json
{
  "email": "user@ejemplo.com",
  "credential": { ... },
  "deviceName": "iPhone 14"
}
```

**Proceso Backend**:
1. **Recupera el challenge de la caché** usando `register:${email}`
2. Verifica la credencial con `verifyRegistrationResponse()`
3. **Elimina el challenge de la caché** (uso único)
4. Guarda la credencial en la base de datos

```typescript
const cacheKey = `register:${email}`
const challengeData = challengeCache.get(cacheKey)

if (!challengeData) {
  return response.status(400).json({ error: 'Challenge expirado' })
}

const verification = await verifyRegistrationResponse({
  response: credential,
  expectedChallenge: challengeData.challenge, // ✅ Challenge correcto
  ...
})

challengeCache.delete(cacheKey) // ✅ Eliminar después de usar
```

---

## 🔄 Flujo de Login

### 1. Cliente solicita opciones de login

**Endpoint**: `POST /api/auth/passkey/login/options`

```json
{
  "email": "user@ejemplo.com"
}
```

**Proceso Backend**:
1. Busca las credenciales del usuario
2. Genera opciones de autenticación con `generateAuthenticationOptions()`
3. **Guarda el challenge en caché** con clave `login:user@ejemplo.com`
4. Devuelve las opciones al cliente

```typescript
const options = await generateAuthenticationOptions({ ... })

challengeCache.set(`login:${email}`, {
  challenge: options.challenge,
  email,
  createdAt: Date.now(),
})

return response.json(options)
```

### 2. Cliente completa el login

**Endpoint**: `POST /api/auth/passkey/login/complete`

```json
{
  "credential": { ... },
  "deviceToken": "..."
}
```

**Proceso Backend**:
1. Busca la credencial en la base de datos usando `credential.id`
2. Obtiene el email del usuario desde la credencial
3. **Recupera el challenge de la caché** usando `login:${email}`
4. Verifica la firma con `verifyAuthenticationResponse()`
5. **Elimina el challenge de la caché**
6. Genera y devuelve el token de acceso

```typescript
const passkeyCredential = await PasskeyCredential.query()
  .where('passkeyCredentialIdBase64', credential.id)
  .preload('user')
  .first()

const userEmail = passkeyCredential.user.userEmail
const cacheKey = `login:${userEmail}`
const challengeData = challengeCache.get(cacheKey)

const verification = await verifyAuthenticationResponse({
  response: credential,
  expectedChallenge: challengeData.challenge, // ✅ Challenge correcto
  ...
})

challengeCache.delete(cacheKey) // ✅ Eliminar después de usar
```

---

## ⏰ Expiración de Challenges

Los challenges expiran automáticamente después de **5 minutos**:

```typescript
setInterval(() => {
  const now = Date.now()
  const FIVE_MINUTES = 5 * 60 * 1000
  
  for (const [key, data] of challengeCache.entries()) {
    if (now - data.createdAt > FIVE_MINUTES) {
      challengeCache.delete(key)
    }
  }
}, 5 * 60 * 1000)
```

**Razones**:
- **Seguridad**: Evita ataques de replay
- **Limpieza**: Evita fugas de memoria
- **UX**: Los usuarios deben completar el flujo en un tiempo razonable

---

## 🚀 Mejoras Futuras (Producción)

### 1. Usar Redis en lugar de Memoria

```typescript
import Redis from 'ioredis'

const redis = new Redis()

// Guardar challenge (expira automáticamente en 5 minutos)
await redis.setex(`passkey:register:${email}`, 300, challenge)

// Recuperar challenge
const challenge = await redis.get(`passkey:register:${email}`)

// Eliminar challenge
await redis.del(`passkey:register:${email}`)
```

**Ventajas**:
- Persiste entre reinicios del servidor
- Funciona en arquitecturas multi-servidor
- Escalable

### 2. Usar Sesiones

```typescript
// Al generar opciones
session.put('passkey_challenge', challenge)

// Al verificar
const challenge = session.get('passkey_challenge')
```

**Ventajas**:
- Vinculado automáticamente a la sesión del usuario
- No necesita clave basada en email
- Más seguro (no se puede adivinar la clave)

### 3. Almacenar en Base de Datos

Crear tabla temporal `passkey_challenges`:

```sql
CREATE TABLE passkey_challenges (
  id UUID PRIMARY KEY,
  email VARCHAR(255),
  challenge TEXT,
  type VARCHAR(20), -- 'register' or 'login'
  created_at TIMESTAMP,
  expires_at TIMESTAMP
)
```

**Ventajas**:
- Auditable
- Persiste entre reinicios
- Fácil de limpiar con queries programadas

---

## 📊 Logs de Debug

El sistema incluye logs para facilitar el debugging:

### Logs de Registro

```
✅ Challenge de registro guardado para user@ejemplo.com: yVpinO8yhB...
🔍 Challenge de registro recuperado para user@ejemplo.com: yVpinO8yhB...
```

### Logs de Login

```
✅ Challenge de login guardado para user@ejemplo.com: xT3mK9pLqA...
🔍 Challenge de login recuperado para user@ejemplo.com: xT3mK9pLqA...
```

---

## 🧪 Pruebas

### Verificar que el Challenge se Guarda

```bash
# Terminal del backend - Observa los logs
npm run dev
```

Cuando solicites opciones de registro/login, deberías ver:
```
✅ Challenge de registro guardado para user@ejemplo.com: ...
```

### Verificar que el Challenge se Recupera

Cuando completes el registro/login, deberías ver:
```
🔍 Challenge de registro recuperado para user@ejemplo.com: ...
```

### Verificar Expiración

1. Solicita opciones de registro
2. Espera **más de 5 minutos**
3. Intenta completar el registro
4. Deberías recibir: `"Challenge no encontrado"`

---

## 🔒 Seguridad

### Protección contra Replay Attacks

- Cada challenge se usa **una sola vez**
- Se elimina inmediatamente después de ser verificado
- Expira automáticamente después de 5 minutos

### Validación de Origen

```typescript
expectedOrigin: env.get('RP_ORIGIN', 'http://localhost:4200')
```

Asegúrate de configurar correctamente en `.env`:

```env
RP_ORIGIN=https://tu-dominio.com
RP_ID=tu-dominio.com
RP_NAME=Tu Aplicación
```

### Validación de RP ID

```typescript
expectedRPID: env.get('RP_ID', 'localhost')
```

El RP ID debe coincidir con el dominio donde se ejecuta la aplicación.

---

## ✅ Resumen

**Antes** (❌ Incorrecto):
```typescript
expectedChallenge: credential.response.clientDataJSON
```

**Ahora** (✅ Correcto):
```typescript
const challengeData = challengeCache.get(`register:${email}`)
expectedChallenge: challengeData.challenge
```

**Resultado**: Los Passkeys ahora funcionan correctamente tanto para registro como para login. 🎉
