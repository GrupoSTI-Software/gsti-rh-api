/* eslint-disable prettier/prettier */
import { HttpContext } from '@adonisjs/core/http'
import User from '../models/user.js'
import PasskeyCredential from '../models/passkey_credential.js'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server'
import env from '../../start/env.js'
import { DateTime } from 'luxon'

/**
 * Caché en memoria para almacenar challenges temporalmente
 * En producción, usar Redis o similar
 */
interface ChallengeData {
  challenge: string
  email: string
  type: 'register' | 'login'
  createdAt: number
}

const challengeCache = new Map<string, ChallengeData>()

// Limpiar challenges expirados cada 5 minutos
setInterval(() => {
  const now = Date.now()
  const FIVE_MINUTES = 5 * 60 * 1000

  for (const [key, data] of challengeCache.entries()) {
    if (now - data.createdAt > FIVE_MINUTES) {
      challengeCache.delete(key)
    }
  }
}, 5 * 60 * 1000)

/**
 * Extrae el challenge del clientDataJSON de una credencial
 */
function extractChallengeFromClientData(clientDataJSON: string): string | null {
  try {
    // Decodificar base64url a string
    const jsonString = Buffer.from(clientDataJSON, 'base64url').toString('utf-8')
    const clientData = JSON.parse(jsonString)
    return clientData.challenge || null
  } catch (error) {
    console.error('Error al extraer challenge:', error)
    return null
  }
}

export default class PasskeyController {
  /**
   * @swagger
   * /api/auth/passkey/register/options:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Passkeys
   *     summary: Obtener opciones para registrar una nueva Passkey
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *                 description: Email del usuario
   *                 required: true
   *     responses:
   *       '200':
   *         description: Opciones de registro generadas exitosamente
   *       '404':
   *         description: Usuario no encontrado
   *       '500':
   *         description: Error del servidor
   */
  async registerOptions({ request, response }: HttpContext) {
    try {
      const { email } = request.only(['email'])

      // Buscar usuario por email
      const user = await User.query().where('userEmail', email).preload('person').first()

      if (!user) {
        return response.status(404).json({
          type: 'error',
          title: 'Usuario no encontrado',
          message: 'No existe un usuario con ese email',
        })
      }

      // Obtener credenciales existentes del usuario para excluirlas
      const existingCredentials = await PasskeyCredential.query()
        .where('userId', user.userId)
        .whereNull('passkey_credential_deleted_at')

      const excludeCredentials = existingCredentials.map((cred) => ({
        id: cred.passkeyCredentialIdBase64,
        type: 'public-key' as const,
        transports: (cred.passkeyCredentialTransports as any[]) || [],
      }))

      // Generar nombre de usuario
      const displayName = user.person
        ? `${user.person.personFirstname || ''} ${user.person.personLastname || ''}`.trim()
        : user.userEmail.split('@')[0]

      // Generar opciones de registro
      const options = await generateRegistrationOptions({
        rpName: env.get('RP_NAME', 'GSTI RH'),
        rpID: env.get('RP_ID', 'localhost'),
        userName: user.userEmail,
        userDisplayName: displayName,
        attestationType: 'none',
        excludeCredentials,
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          userVerification: 'required',
        },
        timeout: 60000,
      })

      // Guardar el challenge en caché para validación posterior
      // Usar el challenge como parte de la clave para permitir múltiples challenges activos
      const cacheKey = `challenge:${options.challenge}`
      challengeCache.set(cacheKey, {
        challenge: options.challenge,
        email,
        type: 'register',
        createdAt: Date.now(),
      })

      return response.status(200).json(options)
    } catch (error) {
      console.error('Error en registerOptions:', error)
      return response.status(500).json({
        type: 'error',
        title: 'Error del servidor',
        message: 'Error al generar opciones de registro',
        error: error.message,
      })
    }
  }

  /**
   * @swagger
   * /api/auth/passkey/register/complete:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Passkeys
   *     summary: Completar el registro de una Passkey
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *                 description: Email del usuario
   *                 required: true
   *               credential:
   *                 type: object
   *                 description: Credencial generada por el navegador
   *                 required: true
   *               deviceName:
   *                 type: string
   *                 description: Nombre descriptivo del dispositivo
   *                 required: false
   *     responses:
   *       '200':
   *         description: Passkey registrada exitosamente
   *       '400':
   *         description: Error de validación
   *       '404':
   *         description: Usuario no encontrado
   *       '500':
   *         description: Error del servidor
   */
  async registerComplete({ request, response }: HttpContext) {
    try {
      const { email, credential, deviceName } = request.only(['email', 'credential', 'deviceName'])

      // Buscar usuario por email
      const user = await User.query().where('userEmail', email).first()

      if (!user) {
        return response.status(404).json({
          type: 'error',
          title: 'Usuario no encontrado',
          message: 'No existe un usuario con ese email',
        })
      }

      // Extraer el challenge del clientDataJSON
      const challengeFromClient = extractChallengeFromClientData(
        credential.response.clientDataJSON,
      )

      if (!challengeFromClient) {
        return response.status(400).json({
          type: 'error',
          title: 'Challenge inválido',
          message: 'No se pudo extraer el challenge de la credencial',
        })
      }

      // Buscar el challenge en el caché usando el challenge como clave
      const cacheKey = `challenge:${challengeFromClient}`
      const challengeData = challengeCache.get(cacheKey)

      if (!challengeData) {
        return response.status(400).json({
          type: 'error',
          title: 'Challenge no encontrado',
          message: 'El challenge ha expirado o no existe. Solicita nuevas opciones de registro.',
        })
      }

      // Validar que el challenge sea del tipo correcto y pertenezca al usuario
      if (challengeData.type !== 'register' || challengeData.email !== email) {
        return response.status(400).json({
          type: 'error',
          title: 'Challenge inválido',
          message: 'El challenge no corresponde a esta operación o usuario',
        })
      }

      // Verificar la respuesta de registro
      const verification = await verifyRegistrationResponse({
        response: credential as RegistrationResponseJSON,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: env.get('RP_ORIGIN', 'http://localhost:4200'),
        expectedRPID: env.get('RP_ID', 'localhost'),
      })

      // Eliminar el challenge de la caché después de usarlo
      challengeCache.delete(cacheKey)

      if (!verification.verified || !verification.registrationInfo) {
        return response.status(400).json({
          type: 'error',
          title: 'Verificación fallida',
          message: 'No se pudo verificar la credencial',
        })
      }

      const { credential: credentialInfo } = verification.registrationInfo

      // Preparar transports: si está vacío o undefined, usar null
      const transports = credentialInfo.transports && credentialInfo.transports.length > 0
        ? credentialInfo.transports
        : null

      // Guardar credencial en la base de datos
      await PasskeyCredential.create({
        userId: user.userId,
        passkeyCredentialIdBase64: credentialInfo.id,
        passkeyCredentialPublicKey: Buffer.from(credentialInfo.publicKey).toString('base64'),
        passkeyCredentialCounter: credentialInfo.counter,
        passkeyCredentialDeviceName: deviceName || 'Dispositivo sin nombre',
        passkeyCredentialTransports: transports,
        // Los campos 'aaguid' y 'backupState' pueden no existir en WebAuthnCredential,
        // por lo tanto se asignan null o false si no están presentes
        passkeyCredentialAaguid: (credentialInfo as any).aaguid || null,
        passkeyCredentialBackedUp: (credentialInfo as any).backupState?.backedUp || false,
      })

      return response.status(200).json({
        type: 'success',
        title: 'Passkey registrada',
        message: 'La Passkey se ha registrado exitosamente',
      })
    } catch (error) {
      console.error('Error en registerComplete:', error)
      return response.status(500).json({
        type: 'error',
        title: 'Error del servidor',
        message: 'Error al completar el registro',
        error: error.message,
      })
    }
  }

  /**
   * @swagger
   * /api/auth/passkey/login/options:
   *   post:
   *     tags:
   *       - Passkeys
   *     summary: Obtener opciones para autenticación con Passkey
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *                 description: Email del usuario (opcional)
   *                 required: false
   *     responses:
   *       '200':
   *         description: Opciones de autenticación generadas exitosamente
   *       '404':
   *         description: Usuario no encontrado o sin Passkeys
   *       '500':
   *         description: Error del servidor
   */
  async loginOptions({ request, response }: HttpContext) {
    try {
      const { email } = request.only(['email'])

      let allowCredentials: Array<{ id: string; type: 'public-key'; transports?: string[] }> = []

      if (email) {
        // Buscar usuario y sus credenciales
        const user = await User.query().where('userEmail', email).first()

        if (!user) {
          return response.status(404).json({
            type: 'error',
            title: 'Usuario no encontrado',
            message: 'No existe un usuario con ese email',
          })
        }

        const credentials = await PasskeyCredential.query()
          .where('userId', user.userId)
          .whereNull('passkey_credential_deleted_at')

        if (credentials.length === 0) {
          return response.status(404).json({
            type: 'error',
            title: 'Sin Passkeys',
            message: 'Este usuario no tiene Passkeys registradas',
          })
        }

        allowCredentials = credentials.map((cred) => ({
          id: cred.passkeyCredentialIdBase64,
          type: 'public-key' as const,
          transports: (cred.passkeyCredentialTransports as any[]) || [],
        }))
      }

      // Generar opciones de autenticación
      const options = await generateAuthenticationOptions({
        rpID: env.get('RP_ID', 'localhost'),
        allowCredentials: allowCredentials.length > 0
          ? allowCredentials.map(({ id, transports }) => ({
              id,
              transports: transports as AuthenticatorTransportFuture[] | undefined,
            }))
          : undefined,
        userVerification: 'required',
        timeout: 60000,
      })

      // Guardar el challenge en caché para validación posterior
      // Usar el challenge como parte de la clave para permitir múltiples challenges activos
      const cacheKey = `challenge:${options.challenge}`
      challengeCache.set(cacheKey, {
        challenge: options.challenge,
        email: email || '',
        type: 'login',
        createdAt: Date.now(),
      })

      return response.status(200).json(options)
    } catch (error) {
      console.error('Error en loginOptions:', error)
      return response.status(500).json({
        type: 'error',
        title: 'Error del servidor',
        message: 'Error al generar opciones de autenticación',
        error: error.message,
      })
    }
  }

  /**
   * @swagger
   * /api/auth/passkey/login/complete:
   *   post:
   *     tags:
   *       - Passkeys
   *     summary: Completar autenticación con Passkey
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               credential:
   *                 type: object
   *                 description: Credencial utilizada para autenticación
   *                 required: true
   *               deviceToken:
   *                 type: string
   *                 description: Token del dispositivo
   *               deviceModel:
   *                 type: string
   *               deviceBrand:
   *                 type: string
   *               deviceType:
   *                 type: string
   *               deviceOs:
   *                 type: string
   *     responses:
   *       '200':
   *         description: Autenticación exitosa
   *       '400':
   *         description: Error de validación
   *       '404':
   *         description: Credencial no encontrada
   *       '500':
   *         description: Error del servidor
   */
  async loginComplete({ request, response }: HttpContext) {
    try {
      const { credential } =
        request.only([
          'credential'
        ])

      // Buscar la credencial en la base de datos
      const passkeyCredential = await PasskeyCredential.query()
        .where('passkeyCredentialIdBase64', credential.id)
        .whereNull('passkey_credential_deleted_at')
        .preload('user', (userQuery) => {
          userQuery.preload('person', (personQuery) => {
            personQuery.preload('employee')
          })
        })
        .first()

      if (!passkeyCredential) {
        return response.status(404).json({
          type: 'error',
          title: 'Credencial no encontrada',
          message: 'La Passkey utilizada no está registrada',
        })
      }

      // Extraer el challenge del clientDataJSON
      const challengeFromClient = extractChallengeFromClientData(
        credential.response.clientDataJSON,
      )

      if (!challengeFromClient) {
        return response.status(400).json({
          type: 'error',
          title: 'Challenge inválido',
          message: 'No se pudo extraer el challenge de la credencial',
        })
      }

      // Buscar el challenge en el caché usando el challenge como clave
      const cacheKey = `challenge:${challengeFromClient}`
      const challengeData = challengeCache.get(cacheKey)

      if (!challengeData) {
        return response.status(400).json({
          type: 'error',
          title: 'Challenge no encontrado',
          message: 'El challenge ha expirado o no existe. Solicita nuevas opciones de autenticación.',
        })
      }

      // Validar que el challenge sea del tipo correcto
      if (challengeData.type !== 'login') {
        return response.status(400).json({
          type: 'error',
          title: 'Challenge inválido',
          message: 'El challenge no corresponde a una operación de login',
        })
      }

      // Verificar la firma de autenticación
      const verification = await verifyAuthenticationResponse({
        response: credential as AuthenticationResponseJSON,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: env.get('RP_ORIGIN', 'http://localhost:4200'),
        expectedRPID: env.get('RP_ID', 'localhost'),
        credential: {
          id: passkeyCredential.passkeyCredentialIdBase64,
          publicKey: new Uint8Array(Buffer.from(passkeyCredential.passkeyCredentialPublicKey, 'base64')),
          counter: passkeyCredential.passkeyCredentialCounter,
          transports: passkeyCredential.passkeyCredentialTransports as any[],
        },
      })

      // Eliminar el challenge de la caché después de usarlo
      challengeCache.delete(cacheKey)

      if (!verification.verified) {
        return response.status(400).json({
          type: 'error',
          title: 'Verificación fallida',
          message: 'La firma de la Passkey no es válida',
        })
      }

      // Actualizar contador y última vez usado
      passkeyCredential.passkeyCredentialCounter = verification.authenticationInfo.newCounter
      passkeyCredential.passkeyCredentialLastUsedAt = DateTime.now()
      await passkeyCredential.save()

      // Generar token de acceso
      const user = passkeyCredential.user
      const token = await User.accessTokens.create(user, ['*'], {
        expiresIn: '24 hours',
      })

      // Registrar dispositivo si se proporcionó información
      // (Similar a como se hace en el login tradicional)

      return response.status(200).json({
        type: 'success',
        title: 'Autenticación exitosa',
        message: 'Has iniciado sesión con tu Passkey',
        data: {
          token: token.value!.release(),
          user: {
            userId: user.userId,
            userEmail: user.userEmail,
          },
        },
      })
    } catch (error) {
      console.error('Error en loginComplete:', error)
      return response.status(500).json({
        type: 'error',
        title: 'Error del servidor',
        message: 'Error al completar la autenticación',
        error: error.message,
      })
    }
  }

  /**
   * @swagger
   * /api/auth/passkey/check:
   *   post:
   *     tags:
   *       - Passkeys
   *     summary: Verificar si un usuario tiene Passkeys registradas
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *                 description: Email del usuario
   *                 required: true
   *     responses:
   *       '200':
   *         description: Verificación realizada
   *       '500':
   *         description: Error del servidor
   */
  async checkPasskeys({ request, response }: HttpContext) {
    try {
      const { email } = request.only(['email'])

      // Buscar usuario
      const user = await User.query().where('userEmail', email).first()

      if (!user) {
        return response.status(200).json({
          hasPasskeys: false,
        })
      }

      // Contar credenciales activas
      const countResult = await PasskeyCredential.query()
        .where('userId', user.userId)
        .whereNull('passkey_credential_deleted_at')
        .count('* as total')

      const total = (countResult[0] as unknown as { total: string | number }).total
      return response.status(200).json({
        hasPasskeys: Number(total || 0) > 0,
      })
    } catch (error) {
      console.error('Error en checkPasskeys:', error)
      return response.status(500).json({
        type: 'error',
        title: 'Error del servidor',
        message: 'Error al verificar Passkeys',
        error: error.message,
      })
    }
  }
}
