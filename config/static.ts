import { defineConfig } from '@adonisjs/static'

/**
 * Configuración del servidor de archivos estáticos.
 * Sirve el contenido del directorio `public/` bajo la raíz del dominio.
 *
 * Uso: GET /devices/zkteco-speedface-v5l.svg
 *   → public/devices/zkteco-speedface-v5l.svg
 *
 * Solo activo para rutas que comienzan con `/devices/` para evitar
 * exponer accidentalmente otros archivos del directorio public.
 */
const staticServerConfig = defineConfig({
  enabled: true,
  etag: true,
  lastModified: true,
  dotFiles: 'ignore',
})

export default staticServerConfig
