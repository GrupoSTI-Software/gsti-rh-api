import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import env from '#start/env'

/**
 * Middleware para autenticación básica HTTP
 * Protege rutas con usuario y contraseña configurados en variables de entorno
 */
export default class BasicAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request, response } = ctx

    // Obtener credenciales de las variables de entorno
    const username = env.get('BASIC_AUTH_USER', 'admin')
    const password = env.get('BASIC_AUTH_PASSWORD', 'admin')

    // Obtener el header de autorización
    const authHeader = request.header('authorization')

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      response.header('WWW-Authenticate', 'Basic realm="Documentación API"')
      return response.status(401).send('Autenticación requerida')
    }

    // Decodificar las credenciales
    const base64Credentials = authHeader.substring(6)
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
    const [providedUsername, providedPassword] = credentials.split(':')

    // Verificar las credenciales
    if (providedUsername !== username || providedPassword !== password) {
      response.header('WWW-Authenticate', 'Basic realm="Documentación API"')
      return response.status(401).send('Credenciales inválidas')
    }

    // Si las credenciales son correctas, continuar
    await next()
  }
}
