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
  /** Zona IANA para reglas de negocio por “día calendario” (vigencias salariales, etc.). Independiente de `TZ` del proceso. */
  APP_BUSINESS_TIMEZONE: Env.schema.string.optional(),

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
  SMTP_PORT: Env.schema.string.optional(),
  SMTP_USERNAME: Env.schema.string.optional(),
  SMTP_PASSWORD: Env.schema.string.optional(),
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
  /*
  |----------------------------------------------------------
  | Variables for configuring api host synchronization 
  |----------------------------------------------------------
  */
  API_BIOMETRICS_HOST: Env.schema.string.optional(),
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
