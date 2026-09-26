import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import { createPlatformUserValidator } from '#validators/platform_user'

/**
 * Controlador de la consola interna de plataforma (GSTI landlord).
 * Todas las rutas de este controlador están protegidas por `auth` + `platformAdmin`.
 */
export default class PlatformUserController {
  /**
   * @swagger
   * /api/platform/whoami:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Platform Admin
   *     summary: Identidad del administrador de plataforma autenticado
   *     description: |
   *       Smoke endpoint que verifica el guard de plataforma y devuelve la
   *       identidad mínima del administrador autenticado.
   *       Requiere sesión válida (`Authorization: Bearer`) y `is_platform_admin = 1`.
   *     responses:
   *       '200':
   *         description: Administrador de plataforma autenticado correctamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 userId:
   *                   type: integer
   *                   description: ID interno del usuario
   *                 userEmail:
   *                   type: string
   *                   description: Correo electrónico del administrador
   *                 isPlatformAdmin:
   *                   type: boolean
   *                   example: true
   *                   description: Siempre true en este endpoint (el guard lo garantiza)
   *       '401':
   *         description: Sin token o token inválido
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *       '403':
   *         description: Sesión válida pero la cuenta no es administrador de plataforma
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Acceso restringido a plataforma
   *                 detail:
   *                   type: string
   *                   example: Esta sección es exclusiva de administradores de plataforma.
   *                 key:
   *                   type: string
   *                   example: AUTH.PLATFORM.FORBIDDEN
   */
  async whoami({ auth, response }: HttpContext) {
    const user = auth.user!
    return response.status(200).json({
      userId: user.userId,
      userEmail: user.userEmail,
      isPlatformAdmin: true,
    })
  }

  /**
   * @swagger
   * /api/platform/users:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Platform Admin
   *     summary: Crear usuario administrador de plataforma
   *     description: |
   *       Crea un nuevo administrador de plataforma (Person mínima + User) en una
   *       transacción atómica. El servidor fija internamente `is_platform_admin = 1`,
   *       `role_id` del rol root y `user_active = 1`; estos campos no forman parte
   *       del body y no pueden ser influidos por el caller (anti-escalada).
   *       Solo ejecutable por un administrador de plataforma activo.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - personFirstname
   *               - personLastname
   *               - userEmail
   *               - userPassword
   *             properties:
   *               personFirstname:
   *                 type: string
   *                 description: Nombre(s) del administrador
   *                 example: Fernando
   *               personLastname:
   *                 type: string
   *                 description: Primer apellido
   *                 example: Canales
   *               personSecondLastname:
   *                 type: string
   *                 description: Segundo apellido (opcional)
   *                 example: López
   *               userEmail:
   *                 type: string
   *                 format: email
   *                 description: Correo institucional único
   *                 example: fernando.canales@gruposti.com
   *               userPassword:
   *                 type: string
   *                 description: Contraseña inicial (mínimo 8 caracteres)
   *                 example: Contraseña123!
   *     responses:
   *       '201':
   *         description: Administrador de plataforma creado correctamente
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
   *                   example: Usuario interno creado
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     user:
   *                       type: object
   *                       properties:
   *                         userId:
   *                           type: integer
   *                         userEmail:
   *                           type: string
   *                         isPlatformAdmin:
   *                           type: boolean
   *                           example: true
   *                         roleId:
   *                           type: integer
   *                           description: ID del rol root (fijado por el servidor)
   *                         personId:
   *                           type: integer
   *       '422':
   *         description: Error de validación (email duplicado u otros campos inválidos)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: AUTH.PLATFORM.USER_EMAIL_TAKEN
   *       '401':
   *         description: Sin token o token inválido
   *       '403':
   *         description: Sesión válida pero sin marcador de administrador de plataforma
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Acceso restringido a plataforma
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: AUTH.PLATFORM.FORBIDDEN
   */
  async store({ request, response }: HttpContext) {
    const data = await request.validateUsing(createPlatformUserValidator)

    const rootRole = await Role.query().where('role_slug', 'root').firstOrFail()

    const newUser = await db.transaction(async (trx) => {
      const person = new Person()
      person.useTransaction(trx)
      person.personFirstname = data.personFirstname
      person.personLastname = data.personLastname
      person.personSecondLastname = data.personSecondLastname ?? ''
      await person.save()

      const user = new User()
      user.useTransaction(trx)
      user.userEmail = data.userEmail
      user.userPassword = data.userPassword
      user.userActive = 1
      user.isPlatformAdmin = true
      user.roleId = rootRole.roleId
      user.personId = person.personId
      user.userEmailType = 'institutional'
      await user.save()

      return user
    })

    return response.status(201).json({
      type: 'success',
      title: 'Usuario interno creado',
      message: 'El administrador de plataforma fue creado correctamente.',
      data: {
        user: {
          userId: newUser.userId,
          userEmail: newUser.userEmail,
          isPlatformAdmin: newUser.isPlatformAdmin,
          roleId: newUser.roleId,
          personId: newUser.personId,
        },
      },
    })
  }
}
