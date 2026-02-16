# Instalación de Passkeys Backend

## 1. Instalar librería de WebAuthn para el servidor

```bash
cd /Users/rogeliojinestasgarcia/Sites/gsti-rh-api
npm install @simplewebauthn/server
```

## 2. Ejecutar la migración

```bash
node ace migration:run
```

## 3. Variables de Entorno

Agrega estas variables a tu `.env`:

```env
# WebAuthn / Passkeys Configuration
RP_NAME="GSTI RH"
RP_ID="localhost"  # En producción: tu-dominio.com
RP_ORIGIN="http://localhost:4200"  # En producción: https://tu-dominio.com
```

**Importante:**
- `RP_ID` debe ser el dominio sin protocolo (ej: `ejemplo.com`)
- `RP_ORIGIN` debe incluir el protocolo y puerto (ej: `https://ejemplo.com`)
- En desarrollo, usa `localhost` (no `127.0.0.1`)

## 4. Verificación

Después de instalar, verifica que todo esté correcto:

```bash
# Ver las rutas
node ace list:routes | grep passkey

# Deberías ver:
# POST /api/auth/passkey/register/options
# POST /api/auth/passkey/register/complete
# POST /api/auth/passkey/login/options
# POST /api/auth/passkey/login/complete
# POST /api/auth/passkey/check
```

## 5. Pruebas

Usa el modo demo del frontend para probar, o usa Postman/Insomnia con los endpoints.
