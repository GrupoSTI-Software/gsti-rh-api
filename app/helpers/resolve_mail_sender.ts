import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

/**
 * Dirección institucional de respaldo que se usa cuando ninguna variable de
 * configuración está definida. Su uso indica que la instalación está
 * incompleta (regla 4, USRH1787178944072).
 */
const DEFAULT_SENDER = 'no-reply@valanserh.local'

/**
 * Resuelve la dirección remitente para todos los correos salientes del sistema.
 *
 * Prelación cerrada (regla 2, USRH1787178944072):
 *   1. `SMTP_FROM_ADDRESS` — dirección explícita de remitente; independiente
 *      de la credencial de autenticación SMTP.
 *   2. `SMTP_USERNAME`     — compatibilidad con instalaciones vigentes donde
 *      ambas coinciden.
 *   3. `DEFAULT_SENDER`    — dirección institucional de respaldo; garantiza
 *      que la función **nunca devuelve vacío** (regla 3).
 *
 * Cuando se aplica el respaldo (paso 3), queda una entrada en bitácora a nivel
 * `warn` con `{ source: 'default' }` indicando que la instalación está mal
 * configurada y que el envío usa la dirección institucional (regla 4).
 *
 * @param overrides - Sobrescrituras opcionales exclusivas para pruebas unitarias.
 *   `@adonisjs/env` almacena en caché los valores del arranque, lo que impide
 *   manipular variables en vivo durante los tests; los overrides evitan ese
 *   problema sin alterar la firma de producción.
 */
export function resolveMailSender(overrides?: { fromAddress?: string; username?: string }): string {
  const fromAddress = (overrides?.fromAddress ?? env.get('SMTP_FROM_ADDRESS', ''))?.trim()
  if (fromAddress) {
    return fromAddress
  }

  const username = (overrides?.username ?? env.get('SMTP_USERNAME', ''))?.trim()
  if (username) {
    return username
  }

  logger.warn(
    { source: 'default' },
    'resolveMailSender: ninguna dirección de remitente configurada; se aplica la dirección institucional de respaldo.'
  )
  return DEFAULT_SENDER
}
