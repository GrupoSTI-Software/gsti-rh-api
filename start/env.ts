/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  /**
   * Secreto exclusivo para el cálculo del índice ciego (blind-index HMAC-SHA256).
   * DISTINTO de APP_KEY (que cifra). NUNCA comprometer en el repo.
   * Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   */
  BLIND_INDEX_KEY: Env.schema.string(),
  /**
   * Secreto del servidor para el sello HMAC-SHA-256 del registro electrónico de
   * jornada (reforma LFT). DISTINTO de APP_KEY y de BLIND_INDEX_KEY. NUNCA vive
   * en el repo.
   * NOTA (spec USRH1782264503158 §12): el spec pide `Env.schema.string()`
   * (obligatoria, sin fallback). Se deja `optional()` a propósito para no
   * romper instalaciones/entornos que aún no sellan jornada; el servicio
   * (`work_journal.hash.ts`) lanza `WJE.SYS.002` en tiempo de sellado si falta.
   * Si Wilvardo confirma que debe ser obligatoria desde el arranque, cambiar a
   * `Env.schema.string()` aquí (una línea) y asegurar que TODOS los .env la
   * definan antes de desplegar.
   * Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   */
  WORK_JOURNAL_HMAC_SECRET: Env.schema.string.optional(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),
  /**
   * Orígenes autorizados por CORS, separados por comas y sin barra final
   * (ej. `https://app.valanserh.com,https://admin.valanserh.com`).
   * OBLIGATORIA a propósito: con `credentials: true`, un API sin lista blanca
   * expone la sesión de cualquier usuario a cualquier sitio que visite. Arrancar
   * sin ella debe fallar, no degradar en silencio.
   */
  CORS_ALLOWED_ORIGINS: Env.schema.string(),
  /** Zona IANA para reglas de negocio por “día calendario” (vigencias salariales, etc.). Independiente de `TZ` del proceso. */
  APP_BUSINESS_TIMEZONE: Env.schema.string.optional(),
  /**
   * Si es `true`, calcula columnas adicionales de HE doble/triple que incluyen
   * tiempo no autorizado (entrada anticipada / salida tardía) sin duplicar
   * rangos ya cubiertos por excepciones autorizadas.
   */
  PAYROLL_OVERTIME_INCLUDE_UNAUTHORIZED: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DB_CONNECTION: Env.schema.string.optional(),
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring session package
  |----------------------------------------------------------
  */
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory'] as const),

  /*
  |----------------------------------------------------------
  | Variables for configuring the mail package
  |----------------------------------------------------------
  */
  SMTP_HOST: Env.schema.string.optional(),
  /** Puerto numérico del servidor SMTP (587 = StartTLS, 465 = SSL, 1025 = Mailpit local). */
  SMTP_PORT: Env.schema.number.optional(),
  /**
   * Dirección remitente explícita de los correos salientes, independiente de la
   * credencial de autenticación SMTP. Prelación: SMTP_FROM_ADDRESS → SMTP_USERNAME →
   * dirección institucional de respaldo `no-reply@valanserh.local`. (USRH1787178944072)
   */
  SMTP_FROM_ADDRESS: Env.schema.string.optional(),
  SMTP_USERNAME: Env.schema.string.optional(),
  SMTP_PASSWORD: Env.schema.string.optional(),
  /**
   * `'true'` para conexión SSL desde el inicio (puerto 465).
   * `'false'` (por defecto) para StartTLS en puerto 587 o sin cifrado en local.
   */
  SMTP_SECURE: Env.schema.string.optional(),
  /**
   * `'true'` para omitir TLS completamente (buzón de pruebas local, Mailpit en
   * puerto 1025). Evita el error `500 5.5.2 Syntax error` al conectar sin cifrado.
   */
  SMTP_IGNORE_TLS: Env.schema.string.optional(),
  /**
   * URL pública del backoffice consumida por los correos del flujo de signup
   * self-service (ej. botón "Ir al sistema" del correo de bienvenida). Se deja
   * opcional para no romper instalaciones legacy que no lo declaren; el servicio
   * de correo aplica un fallback razonable cuando no está definida.
   */
  BACKOFFICE_URL: Env.schema.string.optional(),
  /**
   * URL pública del panel landlord (consola interna GSTI). Usada para construir
   * los enlaces de magic link y recuperación de contraseña de plataforma.
   * Opcional: aplica fallback a localhost:3001 (puerto típico del landlord en dev).
   */
  LANDLORD_URL: Env.schema.string.optional(),
  /**
   * Lista de correos internos de GSTI (administración y atención al cliente) que
   * reciben el aviso de cada contratación self-service. Separados por coma.
   * Opcional: si no está definida, aplica el fallback del servicio.
   */
  BILLING_INTERNAL_NOTIFICATION_EMAILS: Env.schema.string.optional(),
  /**
   * Lista de correos que reciben el aviso de estado de la sincronización automática
   * de asistencias (`commands/sync_assistance.ts`). Reemplaza las direcciones que
   * antes estaban escritas dentro del código. Separados por coma. (USRH1787178944072)
   */
  ASSIST_SYNC_ALERT_EMAILS: Env.schema.string.optional(),
  /*
  |----------------------------------------------------------
  | Almacenamiento de objetos (DigitalOcean Spaces en produccion,
  | MinIO en desarrollo). El codigo sirve para ambos: `forcePathStyle`
  | siempre activo y endpoint por variable.
  |----------------------------------------------------------
  */
  AWS_ACCESS_KEY_ID: Env.schema.string(),
  AWS_SECRET_ACCESS_KEY: Env.schema.string(),
  AWS_ENDPOINT: Env.schema.string(),
  AWS_BUCKET: Env.schema.string(),
  /** El SDK v3 exige region aunque el proveedor S3-compatible la ignore. */
  AWS_DEFAULT_REGION: Env.schema.string.optional(),
  /** Prefijo raiz de todas las keys del bucket. */
  AWS_ROOT_PATH: Env.schema.string(),
  AWS_ROOT_NAME: Env.schema.string.optional(),
  AWS_URL: Env.schema.string.optional(),
  /**
   * URL base (CDN del Space) de las imagenes de referencia de los modelos de
   * dispositivo. Sin ella se devuelve la ruta relativa `/devices/<slug>.webp`,
   * que el frontend resuelve contra su propio host.
   */
  DEVICE_ASSETS_BASE_URL: Env.schema.string.optional(),
  /*
  |----------------------------------------------------------
  | Variables for configuring api host synchronization
  |----------------------------------------------------------
  */
  API_BIOMETRICS_HOST: Env.schema.string.optional(),
  /**
   * URL base del servidor de fotos del checador. Su host es el UNICO origen
   * externo autorizado para leer una foto de empleado
   * (`helpers/employee_photo_source.ts`).
   */
  API_BIOMETRICS_EMPLOYEE_PHOTO_URL: Env.schema.string.optional(),
  /*
  |----------------------------------------------------------
  | Variables for configuring MongoDB connection
  |----------------------------------------------------------
  */
  MONGODB_MODE: Env.schema.enum.optional(['atlas', 'server'] as const),
  MONGODB_STRING: Env.schema.string.optional(),
  MONGODB_HOST: Env.schema.string.optional(),
  MONGODB_PORT: Env.schema.number.optional(),
  MONGODB_USER: Env.schema.string.optional(),
  MONGODB_PASSWORD: Env.schema.string.optional(),
  MONGODB_DB_NAME: Env.schema.string.optional(),
  DB_NAME: Env.schema.string.optional(),
  /*
  |----------------------------------------------------------
  | Variables for configuring basic auth for documentation
  |----------------------------------------------------------
  */
  BASIC_AUTH_USER: Env.schema.string.optional(),
  BASIC_AUTH_PASSWORD: Env.schema.string.optional(),
  /*
  |----------------------------------------------------------
  | Variables para el modo demo y hardening del endpoint demo
  |----------------------------------------------------------
  */
  APP_MODE: Env.schema.enum.optional(['demo', 'production', 'development'] as const),
  DEMO_PASSWORD_HASH: Env.schema.string.optional(),
  /** Hash PHC en Base64 (recomendado: evita que caracteres `$` en .env corrompan el valor). */
  DEMO_PASSWORD_HASH_B64: Env.schema.string.optional(),
  DEMO_ALLOWED_HOSTNAME: Env.schema.string.optional(),
  DEMO_ALLOWED_DB_PATTERN: Env.schema.string.optional(),
  DEMO_AUDIT_EMAIL: Env.schema.string.optional(),
})
