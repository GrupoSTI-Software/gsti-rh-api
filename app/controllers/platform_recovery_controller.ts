import { randomInt } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import { uuid } from 'uuidv4'
import { DateTime } from 'luxon'
import env from '#start/env'
import User from '#models/user'
import AuthMailService from '#services/auth_mail_service'
import { PASSWORD_RECOVERY_PIN_VALIDITY_MINUTES } from '#constants/password_recovery'
import {
  platformRecoveryRequestValidator,
  platformRecoveryCodeVerifyValidator,
  platformPasswordResetValidator,
} from '#validators/platform_recovery'

const DEFAULT_LANDLORD_URL = 'http://localhost:3001'

function generateRecoveryPin(): string {
  return String(randomInt(100000, 1000000)).padStart(6, '0')
}

/** Respuesta genérica de solicitud de recuperación (anti-enumeración). */
const RECOVERY_GENERIC_RESPONSE = {
  type: 'success' as const,
  title: 'Recuperación de contraseña',
  message: 'Si tu correo está registrado, recibirás las instrucciones en breve.',
  data: null,
}

/**
 * Controlador del flujo de recuperación de contraseña exclusivo para
 * administradores de plataforma. Espeja el flujo de tenant pero con
 * gateo `isPlatformAdmin` en cada paso y URL del landlord para los enlaces.
 */
export default class PlatformRecoveryController {
  /**
   * @swagger
   * /api/platform/auth/recovery:
   *   post:
   *     tags:
   *       - Platform Auth
   *     summary: Solicitar recuperación de contraseña de plataforma
   *     description: |
   *       Endpoint público. Genera el PIN y el token de recuperación, y envía el correo
   *       **únicamente** si el correo pertenece a un administrador de plataforma activo.
   *       En cualquier otro caso no produce ningún efecto. Siempre responde 200 genérico
   *       (anti-enumeración). PIN válido por 15 minutos.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - userEmail
   *             properties:
   *               userEmail:
   *                 type: string
   *                 format: email
   *                 example: admin@gruposti.com
   *     responses:
   *       '200':
   *         description: Respuesta genérica (idéntica para admin y no-admin)
   */
  async recovery({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(platformRecoveryRequestValidator)

      const user = await User.query()
        .where('user_email', data.userEmail.trim().toLowerCase())
        .where('user_active', 1)
        .whereNull('user_deleted_at')
        .preload('person')
        .first()

      if (!user?.isPlatformAdmin) {
        return response.status(200).json(RECOVERY_GENERIC_RESPONSE)
      }

      const pinCode = generateRecoveryPin()
      user.userToken = uuid()
      user.pinCode = pinCode
      user.pinCodeExpiresAt = DateTime.utc().plus({ minutes: PASSWORD_RECOVERY_PIN_VALIDITY_MINUTES })
      await user.save()

      const landlordUrl = env.get('LANDLORD_URL') ?? DEFAULT_LANDLORD_URL
      const resetUrl = `${landlordUrl.replace(/\/$/, '')}/auth/recovery/new-password/${user.userToken}`
      const firstName = user.person?.personFirstname || user.userEmail

      const authMailService = new AuthMailService()
      await authMailService.sendPasswordRecovery({
        to: user.userEmail,
        firstName,
        resetUrl,
        pinCode,
        language: 'es',
      })
    } catch {
      // cualquier error se descarta para no filtrar información
    }

    return response.status(200).json(RECOVERY_GENERIC_RESPONSE)
  }

  /**
   * @swagger
   * /api/platform/auth/recovery/verify/{token}:
   *   post:
   *     tags:
   *       - Platform Auth
   *     summary: Verificar token de recuperación de plataforma (etapa 1)
   *     description: |
   *       Verifica que el token de recuperación (etapa 1) existe y pertenece a
   *       un administrador de plataforma activo. No consume el token ni rota el PIN.
   *     parameters:
   *       - in: path
   *         name: token
   *         required: true
   *         schema:
   *           type: string
   *         description: Token de recuperación recibido en el correo
   *     responses:
   *       '200':
   *         description: Token válido — devuelve `true`
   *         content:
   *           application/json:
   *             schema:
   *               type: boolean
   *               example: true
   *       '404':
   *         description: Token no encontrado o cuenta sin marcador de plataforma
   */
  async verifyToken({ params, response }: HttpContext) {
    const user = await User.query()
      .where('user_token', params.token)
      .whereNull('user_deleted_at')
      .first()

    if (!user?.isPlatformAdmin) {
      return response.status(404).json({
        title: 'Token inválido',
        detail: 'El enlace de recuperación no es válido o ha expirado.',
        key: 'AUTH.PLATFORM.RECOVERY.TOKEN_INVALID',
      })
    }

    return response.status(200).json(true)
  }

  /**
   * @swagger
   * /api/platform/auth/recovery/code-verify:
   *   post:
   *     tags:
   *       - Platform Auth
   *     summary: Verificar código OTP de recuperación de plataforma (etapa 2)
   *     description: |
   *       Valida el par token + código OTP de 6 dígitos. Si es correcto y no está
   *       expirado, rota el `userToken` y limpia el PIN (single-use). Devuelve el
   *       nuevo token para usar en el paso de reset. Solo opera para administradores
   *       de plataforma.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - token
   *               - pinCode
   *             properties:
   *               token:
   *                 type: string
   *                 description: Token de la etapa 1
   *               pinCode:
   *                 type: string
   *                 description: Código de 6 dígitos recibido en el correo
   *                 example: "123456"
   *     responses:
   *       '200':
   *         description: OTP correcto — devuelve el token rotado para el paso de reset
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 token:
   *                   type: string
   *                   description: Nuevo token para `POST /api/platform/auth/password/reset`
   *       '401':
   *         description: Código incorrecto, expirado o cuenta sin marcador
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 key:
   *                   type: string
   *                   example: AUTH.PLATFORM.RECOVERY.CODE_INVALID
   */
  async codeVerify({ request, response }: HttpContext) {
    const data = await request.validateUsing(platformRecoveryCodeVerifyValidator)

    const user = await User.query()
      .where('user_token', data.token)
      .where('pin_code', data.pinCode.trim())
      .whereNull('user_deleted_at')
      .first()

    const isExpired = !user?.pinCodeExpiresAt || user.pinCodeExpiresAt < DateTime.utc()

    if (!user?.isPlatformAdmin || isExpired) {
      return response.status(401).json({
        title: 'Código inválido',
        detail: 'El código ingresado no es válido o ha expirado.',
        key: 'AUTH.PLATFORM.RECOVERY.CODE_INVALID',
      })
    }

    const rotatedToken = uuid()
    user.userToken = rotatedToken
    user.pinCode = ''
    user.pinCodeExpiresAt = null
    await user.save()

    return response.status(200).json({ token: rotatedToken })
  }

  /**
   * @swagger
   * /api/platform/auth/password/reset:
   *   post:
   *     tags:
   *       - Platform Auth
   *     summary: Establecer nueva contraseña de plataforma
   *     description: |
   *       Establece la nueva contraseña usando el token rotado de la etapa 2.
   *       No abre sesión — el administrador debe iniciar sesión con las nuevas
   *       credenciales tras el reset. Solo opera para administradores de plataforma.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - token
   *               - userPassword
   *             properties:
   *               token:
   *                 type: string
   *                 description: Token rotado de la etapa 2 (code-verify)
   *               userPassword:
   *                 type: string
   *                 description: Nueva contraseña (mínimo 8 caracteres)
   *     responses:
   *       '200':
   *         description: Contraseña actualizada correctamente (sin sesión)
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
   *                   example: Recuperación de contraseña
   *                 message:
   *                   type: string
   *       '404':
   *         description: Token no encontrado o cuenta sin marcador de plataforma
   *       '401':
   *         description: PIN pendiente (OTP de etapa 2 no completado)
   */
  async passwordReset({ request, response }: HttpContext) {
    const data = await request.validateUsing(platformPasswordResetValidator)

    const user = await User.query()
      .where('user_token', data.token)
      .whereNull('user_deleted_at')
      .first()

    if (!user?.isPlatformAdmin) {
      return response.status(404).json({
        title: 'Token inválido',
        detail: 'El enlace de recuperación no es válido o ha expirado.',
        key: 'AUTH.PLATFORM.RECOVERY.TOKEN_INVALID',
      })
    }

    if (user.pinCode && user.pinCode.trim() !== '') {
      return response.status(401).json({
        title: 'Paso incompleto',
        detail: 'Debes completar la verificación del código antes de cambiar la contraseña.',
        key: 'AUTH.PLATFORM.RECOVERY.PIN_PENDING',
      })
    }

    user.userPassword = data.userPassword
    user.userToken = ''
    user.pinCode = ''
    user.pinCodeExpiresAt = null
    await user.save()

    return response.status(200).json({
      type: 'success',
      title: 'Recuperación de contraseña',
      message: 'Tu contraseña fue actualizada correctamente. Ya puedes iniciar sesión.',
    })
  }
}
