/* eslint-disable no-console -- trazas temporales modo demo */
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import argon2 from 'argon2'
import env from '#start/env'
import { demoRequestValidator } from '../validators/demo_request_validator.js'
import DemoAuditService from '../services/demo_audit_service.js'

console.log('[DEMO-GUARD-MODULE] archivo demo_guard_middleware.ts evaluado (carga del módulo)')

/** PHC string legible por argon2; prioriza Base64 en .env para no romper `$` con el parser. */
function resolveDemoPasswordHashFromEnv(): string {
  const b64 = env.get('DEMO_PASSWORD_HASH_B64', '').trim()
  if (b64) {
    try {
      return Buffer.from(b64, 'base64').toString('utf8')
    } catch {
      return ''
    }
  }
  let raw = env.get('DEMO_PASSWORD_HASH', '').trim()
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim()
  }
  return raw
}

export default class DemoGuardMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request, response } = ctx
    const audit = new DemoAuditService()
    const tag   = `[DEMO-GUARD ${new Date().toISOString()}]`

    const ip        = request.ip()
    const userAgent = request.header('user-agent') ?? ''
    const userId    = ctx.auth.user?.userId ?? null

    console.log(tag, 'handle: inicio', { ip, userId, path: request.url(), method: request.method() })

    // --- 1. Validación de hostname (404 neutro, no revela la ruta) ----------
    const nodeEnv           = env.get('NODE_ENV')
    const allowedHostname   = env.get('DEMO_ALLOWED_HOSTNAME', 'demo.valanserh.com')
    const requestHostname   = request.hostname()

    console.log(tag, 'capa 1 hostname', { nodeEnv, requestHostname, allowedHostname })

    if (nodeEnv === 'production' && requestHostname !== allowedHostname) {
      console.log(tag, 'capa 1: RECHAZO 404 hostname no permitido en prod')
      return response.status(404).send('')
    }

    // --- 2. Validación de HTTPS (skip en desarrollo/test) -------------------
    if (nodeEnv === 'production') {
      const isHttps = request.secure() ||
        request.header('x-forwarded-proto') === 'https'

      if (!isHttps) {
        console.log(tag, 'capa 2: RECHAZO 403 sin HTTPS en prod')
        await audit.log({
          ip, userAgent, userId,
          resultado: 'fallo',
          motivo: 'HTTPS requerido',
        })
        return response.status(403).json({
          type:  'error',
          title: 'HTTPS requerido',
          data:  { key: 'demo-https-requerido' },
        })
      }
      console.log(tag, 'capa 2 HTTPS OK (prod)')
    } else {
      console.log(tag, 'capa 2 HTTPS: omitida (no producción)')
    }

    // --- 3. Validación de rol root ------------------------------------------
    const user = ctx.auth.user
    if (!user) {
      console.log(tag, 'capa 3: RECHAZO 401 sin usuario autenticado')
      return response.status(401).json({
        type:  'error',
        title: 'No autenticado',
        data:  { key: 'unauthenticated' },
      })
    }

    await user.load('role')
    console.log(tag, 'capa 3 rol', { roleSlug: user.role?.roleSlug ?? null })

    if (!user.role || user.role.roleSlug !== 'root') {
      console.log(tag, 'capa 3: RECHAZO 403 rol no root')
      await audit.log({
        ip, userAgent, userId,
        resultado: 'fallo_permisos',
        motivo: `roleSlug=${user.role?.roleSlug ?? 'sin rol'}`,
      })
      return response.status(403).json({
        type:  'error',
        title: 'Permisos insuficientes',
        data:  { key: 'demo-rol-root-requerido' },
      })
    }

    // --- 4. Validación de nombre de DB activa -------------------------------
    const dbName        = env.get('DB_DATABASE', '')
    const allowedPattern = env.get('DEMO_ALLOWED_DB_PATTERN', 'demo')
    const dbPass          = dbName.includes(allowedPattern)

    console.log(tag, 'capa 4 DB', { dbName, allowedPattern, pass: dbPass })

    if (!dbPass) {
      console.log(tag, 'capa 4: RECHAZO 403 DB no autorizada')
      await audit.log({
        ip, userAgent, userId,
        resultado: 'fallo_db',
        motivo: `DB_DATABASE="${dbName}" no contiene patrón="${allowedPattern}"`,
      })
      return response.status(403).json({
        type:  'error',
        title: 'Conexión de base de datos no autorizada',
        data:  { key: 'demo-db-no-autorizada' },
      })
    }

    // --- 5. Validación de password vía argon2 --------------------------------
    let parsedBody: { password: string }
    try {
      parsedBody = await demoRequestValidator.validate(request.body())
      console.log(tag, 'capa 5 body validado (password length, no valor)', {
        passwordLength: parsedBody.password?.length ?? 0,
      })
    } catch (e) {
      console.log(tag, 'capa 5: RECHAZO 422 validación Vine', e)
      return response.status(422).json({
        type:  'error',
        title: 'Parámetros inválidos',
        data:  { key: 'demo-parametros-invalidos' },
      })
    }

    const hashRaw = resolveDemoPasswordHashFromEnv()
    if (!hashRaw) {
      console.log(tag, 'capa 5: RECHAZO 500 DEMO_PASSWORD_HASH vacío (ni B64 ni texto)')
      await audit.log({
        ip, userAgent, userId,
        resultado: 'fallo',
        motivo: 'DEMO_PASSWORD_HASH / DEMO_PASSWORD_HASH_B64 no configurado',
      })
      return response.status(500).json({
        type:  'error',
        title: 'Configuración incompleta',
        data:  { key: 'server-error' },
      })
    }

    if (nodeEnv === 'development') {
      console.log(tag, 'capa 5 hash desde env', {
        source:        env.get('DEMO_PASSWORD_HASH_B64', '').trim() ? 'DEMO_PASSWORD_HASH_B64' : 'DEMO_PASSWORD_HASH',
        length:        hashRaw.length,
        prefix:        hashRaw.slice(0, 24),
        looksLikePhc:  hashRaw.startsWith('$argon2'),
      })
    }

    let passwordValid = false
    let verifyError: string | undefined
    try {
      passwordValid = await argon2.verify(hashRaw, parsedBody.password.trim())
    } catch (e) {
      verifyError = e instanceof Error ? e.message : String(e)
      passwordValid = false
    }

    console.log(tag, 'capa 5 argon2.verify', { passwordValid, verifyError })

    if (!passwordValid) {
      console.log(tag, 'capa 5: RECHAZO 401 password incorrecta')
      await audit.log({
        ip, userAgent, userId,
        resultado: 'fallo',
        motivo: 'Password de demo incorrecta',
      })
      return response.status(401).json({
        type:  'error',
        title: 'Password de demo incorrecta',
        data:  { key: 'demo-password-invalida' },
      })
    }

    console.log(tag, 'todas las capas OK, invocando next() -> controller + service')

    // Todas las capas pasaron — continuar y registrar éxito después
    await next()

    console.log(tag, 'next() completó (controller respondió)')

    await audit.log({
      ip, userAgent, userId,
      resultado: 'exito',
    })
  }
}
