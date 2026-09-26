import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import AuthTokenService from '#services/auth_token_service'
import { platformLoginValidator, platformRefreshValidator } from '#validators/platform_auth'

const PLATFORM_ORIGIN = 'platform'

/** Respuesta genérica de rechazo (anti-enumeración). */
const INVALID_CREDENTIALS_RESPONSE = {
  title: 'No pudimos iniciar sesión',
  detail: 'Las credenciales no son válidas para esta consola.',
  key: 'AUTH.PLATFORM.INVALID_CREDENTIALS',
} as const

/** Respuesta de sesión expirada / refresh inválido. */
const SESSION_EXPIRED_RESPONSE = {
  title: 'Sesión expirada',
  detail: 'La sesión de plataforma ha expirado o ya fue usada. Inicia sesión de nuevo.',
  key: 'AUTH.PLATFORM.SESSION_EXPIRED',
} as const

/**
 * Controlador de autenticación de la consola interna de plataforma (GSTI landlord).
 *
 * Los endpoints de login y refresh son públicos (validan identidad internamente).
 * Los endpoints de session y logout requieren `auth` + `platformAdmin`.
 */
export default class PlatformAuthController {
  /**
   * @swagger
   * /api/platform/auth/login:
   *   post:
   *     tags:
   *       - Platform Auth
   *     summary: Iniciar sesión en la consola interna de plataforma
   *     description: |
   *       Autentica al administrador con correo y contraseña. Solo emite sesión si la cuenta
   *       tiene `is_platform_admin = 1`. Cualquier fallo (credenciales incorrectas, cuenta
   *       inexistente o sin el marcador) devuelve la misma respuesta genérica 401 para evitar
   *       revelar si el correo existe o qué faltó (anti-enumeración).
   *       Un login exitoso revoca la sesión de plataforma anterior del mismo usuario (sesión única).
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - userEmail
   *               - userPassword
   *             properties:
   *               userEmail:
   *                 type: string
   *                 format: email
   *                 example: admin@gruposti.com
   *               userPassword:
   *                 type: string
   *                 example: Contraseña123!
   *     responses:
   *       '200':
   *         description: Sesión de plataforma emitida
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Login
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     token:
   *                       type: string
   *                       description: Access token (Bearer, TTL 15 min)
   *                     refreshToken:
   *                       type: string
   *                       description: Refresh token de un solo uso (TTL 7 días)
   *                     user:
   *                       type: object
   *                       description: Datos del administrador con persona precargada
   *       '401':
   *         description: Credenciales inválidas, cuenta sin marcador o no encontrada (anti-enumeración)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: No pudimos iniciar sesión
   *                 detail:
   *                   type: string
   *                   example: Las credenciales no son válidas para esta consola.
   *                 key:
   *                   type: string
   *                   example: AUTH.PLATFORM.INVALID_CREDENTIALS
   */
  async login({ request, response }: HttpContext) {
    const data = await request.validateUsing(platformLoginValidator)
    const authTokenService = new AuthTokenService()

    try {
      const verifiedUser = await User.verifyCredentials(data.userEmail, data.userPassword)

      if (!verifiedUser.isPlatformAdmin) {
        return response.status(401).json(INVALID_CREDENTIALS_RESPONSE)
      }

      const user = await User.query()
        .where('user_id', verifiedUser.userId)
        .preload('person')
        .firstOrFail()

      await authTokenService.revokeByOrigin(user.userId, PLATFORM_ORIGIN)
      const { accessToken, refreshToken } = await authTokenService.issueTokenPair(user, PLATFORM_ORIGIN)

      return response.status(200).json({
        type: 'success',
        title: 'Login',
        message: 'Has iniciado sesión en la consola de plataforma.',
        data: {
          user,
          token: accessToken,
          refreshToken,
        },
      })
    } catch {
      return response.status(401).json(INVALID_CREDENTIALS_RESPONSE)
    }
  }

  /**
   * @swagger
   * /api/platform/auth/refresh:
   *   post:
   *     tags:
   *       - Platform Auth
   *     summary: Renovar la sesión de plataforma (rotación single-use)
   *     description: |
   *       Rota el par de tokens de plataforma. El refresh token anterior queda invalidado
   *       inmediatamente (single-use). Solo opera sobre tokens con `origin = 'platform'`.
   *       Si el token es inválido, ya fue usado o expiró, responde 401.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - refreshToken
   *             properties:
   *               refreshToken:
   *                 type: string
   *                 description: Refresh token obtenido en login o en el último refresh
   *     responses:
   *       '200':
   *         description: Par de tokens renovado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     token:
   *                       type: string
   *                       description: Nuevo access token (TTL 15 min)
   *                     refreshToken:
   *                       type: string
   *                       description: Nuevo refresh token single-use (TTL 7 días)
   *       '401':
   *         description: Refresh token inválido, expirado o ya usado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Sesión expirada
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: AUTH.PLATFORM.SESSION_EXPIRED
   */
  async refresh({ request, response }: HttpContext) {
    const data = await request.validateUsing(platformRefreshValidator)
    const authTokenService = new AuthTokenService()

    const result = await authTokenService.verifyRefreshToken(data.refreshToken)

    if (result.status === 'error') {
      return response.status(401).json(SESSION_EXPIRED_RESPONSE)
    }

    if (result.origin !== PLATFORM_ORIGIN || !result.user.isPlatformAdmin) {
      return response.status(401).json(SESSION_EXPIRED_RESPONSE)
    }

    const { accessToken, refreshToken } = await authTokenService.rotateTokenPair(
      result.user,
      PLATFORM_ORIGIN
    )

    return response.status(200).json({
      type: 'success',
      title: 'Sesión renovada',
      message: 'La sesión de plataforma fue renovada correctamente.',
      data: {
        token: accessToken,
        refreshToken,
      },
    })
  }

  /**
   * @swagger
   * /api/platform/auth/session:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Platform Auth
   *     summary: Consultar la sesión de plataforma activa
   *     description: |
   *       Devuelve la identidad del administrador de plataforma actualmente autenticado,
   *       con su persona precargada. Usado por el panel para mostrar nombre y correo en el header.
   *       Requiere Bearer token de plataforma válido y `is_platform_admin = 1`.
   *     responses:
   *       '200':
   *         description: Datos del administrador autenticado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 userId:
   *                   type: integer
   *                 userEmail:
   *                   type: string
   *                 isPlatformAdmin:
   *                   type: boolean
   *                   example: true
   *                 person:
   *                   type: object
   *                   properties:
   *                     personFirstname:
   *                       type: string
   *                     personLastname:
   *                       type: string
   *                     personSecondLastname:
   *                       type: string
   *       '401':
   *         description: Sin token o token inválido
   *       '403':
   *         description: Token válido pero cuenta sin marcador de plataforma
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Acceso restringido a plataforma
   *                 key:
   *                   type: string
   *                   example: AUTH.PLATFORM.FORBIDDEN
   */
  async session({ auth, response }: HttpContext) {
    const user = await User.query()
      .where('user_id', auth.user!.userId)
      .preload('person')
      .firstOrFail()

    return response.status(200).json(user)
  }

  /**
   * @swagger
   * /api/platform/auth/logout:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Platform Auth
   *     summary: Cerrar sesión de plataforma
   *     description: |
   *       Invalida completamente la sesión de plataforma activa (access + refresh token).
   *       No afecta sesiones de tenant del mismo usuario. Requiere Bearer token válido.
   *     responses:
   *       '200':
   *         description: Sesión invalidada correctamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Logout
   *                 message:
   *                   type: string
   *       '401':
   *         description: Sin token o token inválido
   *       '403':
   *         description: Token válido pero cuenta sin marcador de plataforma
   */
  async logout({ auth, response }: HttpContext) {
    const authTokenService = new AuthTokenService()
    await authTokenService.revokeByOrigin(auth.user!.userId, PLATFORM_ORIGIN)

    return response.status(200).json({
      type: 'success',
      title: 'Logout',
      message: 'Has cerrado la sesión de la consola de plataforma.',
    })
  }
}
