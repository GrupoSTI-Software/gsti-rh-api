import { defineConfig } from '@adonisjs/static'

/**
 * Servidor de archivos estáticos APAGADO.
 *
 * El API no sirve archivos desde su propio dominio. Estuvo activo para exponer
 * `public/devices/*.svg`, pero un SVG es XML y admite `<script>`: servirlo
 * desde el dominio del API lo pone en su mismo origen.
 *
 * Además, pese al comentario que llevaba esta configuración, `enabled: true`
 * NO acotaba nada a `/devices/`: servía el directorio `public/` completo.
 *
 * Las imagenes de referencia de los modelos de dispositivo viven ahora en el
 * Space como WebP (ver `platform_device_model_service.resolvePhotoUrl`). El
 * resto de los archivos sale por endpoint autenticado que resuelve la clave
 * del objeto desde el recurso.
 */
const staticServerConfig = defineConfig({
  enabled: false,
  etag: true,
  lastModified: true,
  dotFiles: 'ignore',
})

export default staticServerConfig
