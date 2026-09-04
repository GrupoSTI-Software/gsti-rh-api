import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import UploadService from '#services/upload_service'

/**
 * Resuelve el contenido de la foto de un empleado, venga de donde venga.
 *
 * El campo `employeePhoto` guarda hoy dos cosas distintas:
 *
 * 1. Una key del bucket, para las fotos que sube el sistema.
 * 2. Una URL del servidor de biometricos, para las que llegan de la
 *    sincronizacion del checador (`employee_service.ts` la compone con
 *    `API_BIOMETRICS_EMPLOYEE_PHOTO_URL`). Ese servidor no es el bucket y su
 *    contenido no pasa por el intake.
 *
 * Mezclar ambos casos en la lectura del bucket dejaba sin foto a los empleados
 * sincronizados; hacer un GET a cualquier cosa que traiga el campo reabre la
 * puerta que se cerro al borrar `proxy-image`. Por eso el origen externo se
 * acepta SOLO si su host coincide con el configurado para el checador.
 */

/** Tope de descarga del origen externo, alineado con el resto de lecturas. */
const EXTERNAL_PHOTO_TIMEOUT_MS = 8000

/** Host autorizado para fotos externas: el del servidor de biometricos. */
function allowedExternalHost(): string | null {
  const configured = env.get('API_BIOMETRICS_EMPLOYEE_PHOTO_URL')
  if (!configured) return null

  try {
    return new URL(configured).host
  } catch {
    return null
  }
}

/** Verdadero si la cadena es una URL del servidor de biometricos configurado. */
export function isBiometricsPhotoUrl(storedPath: string): boolean {
  if (!/^https?:\/\//i.test(storedPath)) return false

  const allowed = allowedExternalHost()
  if (!allowed) return false

  try {
    return new URL(storedPath).host === allowed
  } catch {
    return false
  }
}

/**
 * Devuelve el binario de la foto, o `null` si no se pudo obtener. Nunca lanza:
 * la foto es opcional en todos sus consumidores (gafete, rostro, correos).
 */
export async function readEmployeePhotoBuffer(
  storedPath: string | null | undefined
): Promise<Buffer | null> {
  if (!storedPath) return null

  if (isBiometricsPhotoUrl(storedPath)) {
    return readFromBiometricsServer(storedPath)
  }

  return new UploadService().readStoredFileBuffer(storedPath)
}

async function readFromBiometricsServer(url: string): Promise<Buffer | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_PHOTO_TIMEOUT_MS)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return null

    return Buffer.from(await response.arrayBuffer())
  } catch (err) {
    logger.warn({ err, host: new URL(url).host }, 'No fue posible leer la foto del checador')
    return null
  } finally {
    clearTimeout(timeout)
  }
}
