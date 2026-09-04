import { defineConfig } from '@adonisjs/cors'
import { isAdmsChannelUrl } from '#constants/adms_channel'
import env from '#start/env'

/**
 * Lista blanca de orígenes autorizados, leída de `CORS_ALLOWED_ORIGINS`
 * (separada por comas). Se resuelve una sola vez al arrancar el proceso.
 *
 * Con `credentials: true`, reflejar el `Origin` de quien pregunta (`origin: true`)
 * permite a cualquier sitio que visite un usuario con sesión activa llamar al API
 * con esa sesión y leer la respuesta. La lista blanca es lo único que lo impide.
 */
const allowedOrigins: readonly string[] = env
  .get('CORS_ALLOWED_ORIGINS')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0)

/**
 * Configuration options to tweak the CORS policy. The following
 * options are documented on the official documentation website.
 *
 * https://docs.adonisjs.com/guides/security/cors
 */
const corsConfig = defineConfig({
  /**
   * El canal ADMS del checador queda fuera del middleware: no manda `Origin`,
   * no hace preflight y no sabe interpretar una negativa de CORS.
   */
  enabled: (ctx) => !isAdmsChannelUrl(ctx.request.url()),
  origin: (origin) => allowedOrigins.includes(origin),
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH'],
  headers: true,
  exposeHeaders: [],
  credentials: true,
  maxAge: 90,
})

export default corsConfig
