# MongoDB Configuration and Usage in SAE API

## Overview

Este sistema utiliza MongoDB como base de datos de auditoría/logging para registrar todas las acciones de los usuarios en la aplicación. MongoDB funciona de forma complementaria a MySQL, que es la base de datos principal para los datos transaccionales.

## Connection Modes

El sistema soporta dos modos de conexión a MongoDB:

### 1. Atlas Mode (`MONGODB_MODE="atlas"`)

**Descripción:** Modo diseñado para conectarse a MongoDB Atlas (cloud).

**Variables de entorno requeridas:**
```env
MONGODB_MODE="atlas"
MONGODB_STRING="mongodb+srv://usuario:password@cluster.mongodb.net/?appName=Cluster0"
DB_NAME="nombre_base_datos"
```

**Características:**
- Utiliza el protocolo `mongodb+srv://` optimizado para MongoDB Atlas
- Requiere un string de conexión completo que incluye credenciales y cluster
- Ideal para entornos de producción y desarrollo en la nube
- Soporta autenticación automática mediante el string de conexión
- No requiere especificar puerto (usa el predeterminado de Atlas)

**Ejemplo de configuración:**
```env
MONGODB_MODE="atlas"
MONGODB_STRING="mongodb+srv://lexus:password123@cluster0.rydnf.mongodb.net/?appName=Cluster0"
DB_NAME="sae_audit_database"
```

**Ventajas:**
- Configuración simple con una sola variable
- Optimizado para MongoDB Atlas
- No requiere gestión de puertos
- Conexión segura por defecto

### 2. Server Mode (`MONGODB_MODE="server"`)

**Descripción:** Modo diseñado para conectarse a un servidor MongoDB local o remoto tradicional.

**Variables de entorno requeridas:**
```env
MONGODB_MODE="server"
MONGODB_HOST="localhost"
MONGODB_PORT=27017
DB_NAME="nombre_base_datos"
```

**Variables opcionales:**
```env
MONGODB_USER="usuario"           # Solo si MongoDB requiere autenticación
MONGODB_PASSWORD="password"      # Solo si MongoDB requiere autenticación
```

**Características:**
- Utiliza el protocolo `mongodb://` estándar
- Requiere especificar host y puerto explícitamente
- Ideal para servidores MongoDB locales o en red privada
- Soporta conexiones con y sin autenticación
- Permite mayor control sobre la configuración de conexión

**Ejemplo de configuración con autenticación:**
```env
MONGODB_MODE="server"
MONGODB_HOST="192.168.1.100"
MONGODB_PORT=27017
MONGODB_USER="admin"
MONGODB_PASSWORD="secure_password"
DB_NAME="sae_audit_database"
```

**Ejemplo de configuración sin autenticación:**
```env
MONGODB_MODE="server"
MONGODB_HOST="localhost"
MONGODB_PORT=27017
DB_NAME="sae_audit_database"
```

**Ventajas:**
- Mayor control sobre la configuración
- Ideal para entornos locales o privados
- Flexible en términos de autenticación
- Útil para desarrollo y testing

## Comparación de Modos
|----------------+-----------------------+----------------------------------|
| Característica | Atlas Mode            | Server Mode                      |
|----------------+-----------------------+----------------------------------|
| Protocolo      | `mongodb+srv://`      | `mongodb://`                     |
| Puerto         | Automático            | Requerido (default: 27017)       |
| Host           | En string de conexión | Variable separada                |
| Autenticación  | En string de conexión | Variables separadas              |
| Uso            | Producción/Cloud      | Local/Privado                    |
| Configuración  | Simple (1 variable)   | Flexible (múltiples variables)   |
| Ideal para     | MongoDB Atlas         | Servidores MongoDB tradicionales |
|----------------+-----------------------+----------------------------------|

## Collections Utilizadas

El sistema utiliza las siguientes colecciones en MongoDB:

1. **`log_request`**                - Registros de navegación y páginas visitadas
2. **`log_users`**                  - Auditoría de cambios en usuarios
3. **`log_authentication`**         - Eventos de autenticación
4. **`log_assist`**                 - Auditoría de registros de asistencia
5. **`log_employee_shifts`**        - Auditoría de asignaciones de turnos
6. **`log_employee_shift_changes`** - Auditoría de cambios de turnos
7. **`log_shift_exceptions`**       - Auditoría de excepciones de turnos (general)
8. **`log_vacations`**              - Auditoría específica de vacaciones
9. **`log_proceeding_files`**       - Auditoría de archivos de expedientes

## Estructura de Datos de Logs

Todos los logs de auditoría comparten una estructura común:

```typescript
{
  user_id: number,              // ID del usuario que realizó la acción
  action: 'store' | 'update' | 'delete',  // Tipo de acción
  user_agent: string,           // Información del navegador
  sec_ch_ua_platform: string,   // Plataforma del cliente
  sec_ch_ua: string,            // Información del cliente
  origin: string,               // Origen de la petición
  date: string,                 // Fecha/hora en UTC (ISO)
  record_previous: object,      // Estado anterior (null en 'store')
  record_current: object        // Estado actual
}
```

## Connection Handling

El sistema implementa:

- **Reconexión automática:** Si la conexión se pierde, intenta reconectarse cada 10 segundos
- **Timeout de conexión:** 5 segundos máximo para establecer conexión
- **Validación de variables:** Verifica que todas las variables requeridas estén configuradas
- **Manejo de errores:** Los errores de conexión no afectan el funcionamiento principal de la API
- **Lazy connection:** La conexión se establece solo cuando se necesita guardar o consultar logs

## Notas Importantes

1. **DB_NAME es compartido:** Tanto en modo Atlas como Server, ambas configuraciones usan la variable `DB_NAME` para especificar la base de datos de destino.

2. **Seguridad:** En producción, nunca commitees las credenciales. Usa variables de entorno y asegúrate de que el archivo `.env` esté en `.gitignore`.

3. **Performance:** Los logs se guardan de forma asíncrona y no bloquean las operaciones principales de la API.

4. **Modo por defecto:** Si no se especifica `MONGODB_MODE`, el sistema usa `"server"` por defecto.

