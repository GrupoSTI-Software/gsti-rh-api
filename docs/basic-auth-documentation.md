# Autenticación Básica para Documentación API

## Descripción

La documentación de la API (Swagger) está protegida con autenticación básica HTTP. Esto significa que necesitarás proporcionar un usuario y contraseña para acceder a la documentación.

## Configuración

### Variables de Entorno

Agrega las siguientes variables a tu archivo `.env`:

```env
BASIC_AUTH_USER="desarrollo-software@gruposti.com"
BASIC_AUTH_PASSWORD="APIGrupoSTI"
```

**IMPORTANTE:** Cambia estos valores por credenciales seguras en producción.

### Valores por Defecto

Si no se configuran las variables de entorno, se utilizarán los siguientes valores por defecto:
- Usuario: `admin`
- Contraseña: `admin`

## Acceso a la Documentación

### Navegador Web

1. Accede a la URL de la documentación (por ejemplo: `http://localhost:3333/` o `http://localhost:3333/swagger.json`)
2. El navegador mostrará una ventana emergente solicitando usuario y contraseña
3. Ingresa las credenciales configuradas en las variables de entorno
4. Una vez autenticado, podrás acceder a la documentación

### Usando cURL

```bash
curl -u desarrollo-software@gruposti.com:APIGrupoSTI http://localhost:3333/
```

O con el header de autorización (el valor Base64 debe ser generado con tus credenciales):

```bash
# Para generar el valor Base64:
echo -n "usuario:contraseña" | base64

# Luego usar el resultado en el header:
curl -H "Authorization: Basic <valor-base64>" http://localhost:3333/
```

### Usando Postman

1. Abre Postman
2. Crea una nueva petición GET a `http://localhost:3333/`
3. Ve a la pestaña "Authorization"
4. Selecciona "Basic Auth" como tipo
5. Ingresa el usuario y contraseña
6. Envía la petición

## Rutas Protegidas

Las siguientes rutas están protegidas con autenticación básica:

- `/` - Interfaz de Swagger UI
- `/swagger.json` - Especificación OpenAPI en formato JSON

## Implementación Técnica

### Middleware

El middleware de autenticación básica se encuentra en:
```
app/middleware/basic_auth_middleware.ts
```

Este middleware:
- Verifica el header `Authorization` en cada petición
- Decodifica las credenciales en formato Base64
- Compara con las credenciales configuradas en las variables de entorno
- Retorna un error 401 si las credenciales son incorrectas o no se proporcionan

### Registro del Middleware

El middleware está registrado en `start/kernel.ts` como middleware nombrado:

```typescript
export const middleware = router.named({
  auth: () => import('#middleware/auth_middleware'),
  basicAuth: () => import('#middleware/basic_auth_middleware'),
})
```

### Aplicación en Rutas

Las rutas de documentación están protegidas en `start/routes.ts`:

```typescript
// Ruta principal de Swagger UI
router
  .get('/', async ({ view }) => {
    const specUrl = '/swagger.json'
    return view.render('swagger', { specUrl })
  })
  .use(middleware.basicAuth())

// Ruta de especificación JSON
router
  .get('/swagger.json', async ({ response }) => {
    // ... código para servir el archivo swagger.json
  })
  .use(middleware.basicAuth())
```

## Configuración de Swagger

En `config/swagger.ts`, las rutas automáticas del paquete están deshabilitadas para permitir el control manual:

```typescript
export default {
  uiEnabled: false,
  specEnabled: false,
  // ...
}
```

Esto permite registrar las rutas manualmente con el middleware de autenticación básica.

## Seguridad

### Recomendaciones

1. **Nunca uses credenciales por defecto en producción**
2. Usa contraseñas seguras (mínimo 12 caracteres, combinando letras, números y símbolos)
3. Considera usar un gestor de secretos para almacenar las credenciales
4. **Habilita HTTPS en producción** para que las credenciales viajen cifradas
5. Cambia las credenciales periódicamente
6. No compartas las credenciales en repositorios públicos

### Ejemplo de Credenciales Seguras

```env
BASIC_AUTH_USER="api_docs_admin_2024"
BASIC_AUTH_PASSWORD="X9$mK2#pL5@nQ8&wR4"
```

## Solución de Problemas

### Error: "Fetch error Internal Server Error /swagger.json"

Este error puede ocurrir si:
1. El archivo `docs/swagger.json` no existe o no se ha generado
2. Las rutas no están configuradas correctamente
3. El servidor necesita reiniciarse después de los cambios

**Solución:**
1. Reinicia el servidor: `npm run dev`
2. Verifica que el archivo `docs/swagger.json` exista
3. Verifica que las variables de entorno estén configuradas correctamente

### Error 401 con credenciales correctas

Si recibes un error 401 aunque las credenciales sean correctas:
1. Verifica que las variables de entorno estén cargadas correctamente
2. Reinicia el servidor
3. Verifica que no haya espacios en blanco al inicio o final de las credenciales

## Desactivar la Autenticación (No Recomendado)

Si por alguna razón necesitas desactivar la autenticación básica:

1. Edita el archivo `start/routes.ts`
2. Elimina `.use(middleware.basicAuth())` de las rutas de documentación

**ADVERTENCIA:** Esto dejará la documentación accesible públicamente.
