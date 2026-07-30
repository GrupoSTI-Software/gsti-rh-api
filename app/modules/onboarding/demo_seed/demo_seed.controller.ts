import { HttpContext } from '@adonisjs/core/http'
import OnboardingError from '#exceptions/onboarding_error'
import type { OnboardingErrorKey } from '#exceptions/onboarding_error'
import { ONBOARDING_ERROR_STATUS } from '#modules/onboarding/onboarding.constants'
import DemoSeedService from './demo_seed.service.js'

/**
 * Controller de la siembra demo del onboarding (USRH1785438246847).
 *
 * Seguridad:
 *  - middleware.auth() + middleware.businessScope() (divergencia deliberada
 *    del área, que solo monta auth: este submódulo SÍ crea entidades
 *    tenant-scoped y exige el scope fail-closed por header X-Business-Unit-Id).
 *  - El userId siempre proviene de auth.user.userId; nunca del body (anti-IDOR).
 *  - Rate limit por userId definido en las rutas.
 */
export default class DemoSeedController {
  /**
   * @swagger
   * /api/onboarding/me/demo-seed:
   *   post:
   *     summary: Prepara los datos de práctica del recorrido guiado (idempotente)
   *     description: |
   *       Crea en una sola transacción el paquete demo (departamento, puesto,
   *       empleado de práctica, usuario de la app, turno, checadas y vacaciones
   *       de ejemplo) dentro de la empresa activa, registrando cada pieza para
   *       el borrado posterior. La contraseña de práctica viaja en claro UNA
   *       única vez; repetir la petición responde el mismo paquete sin
   *       contraseña. 201 al crear, 200 idempotente.
   *     security:
   *       - bearerAuth: []
   *     tags: [Onboarding]
   *     parameters:
   *       - name: X-Business-Unit-Id
   *         in: header
   *         required: true
   *         schema: { type: string }
   *         description: Código público (UUID v4) de la unidad de negocio activa
   *     responses:
   *       201:
   *         description: Paquete demo creado; credencial incluida una única vez
   *       200:
   *         description: Siembra ya activa; mismo paquete con alreadySeeded true
   *       409:
   *         description: Siembra de otra unidad de negocio o límite de empleados
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title: { type: string }
   *                 detail: { type: string }
   *                 key: { type: string, example: siembra-demo-unidad-invalida }
   *       429:
   *         description: Tope de intentos alcanzado
   */
  async seed(ctx: HttpContext) {
    const { auth, businessUnitScope, i18n } = ctx
    const userId = auth.user!.userId
    const service = new DemoSeedService(i18n)

    try {
      const { result, created } = await service.seed(userId, businessUnitScope[0])
      return ctx.response.status(created ? 201 : 200).json({
        type: 'success',
        title: 'Onboarding',
        message: 'Datos de práctica preparados correctamente.',
        data: result,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/onboarding/me/demo-seed/credentials:
   *   post:
   *     summary: Regenera la contraseña de la credencial de práctica
   *     description: |
   *       Genera una contraseña nueva (CSPRNG) para el usuario demo, revoca sus
   *       sesiones vigentes (tokens + logout WS) y la entrega en claro una única
   *       vez. La anterior deja de funcionar de inmediato.
   *     security:
   *       - bearerAuth: []
   *     tags: [Onboarding]
   *     parameters:
   *       - name: X-Business-Unit-Id
   *         in: header
   *         required: true
   *         schema: { type: string }
   *         description: Código público (UUID v4) de la unidad de negocio activa
   *     responses:
   *       200:
   *         description: Credencial regenerada; contraseña incluida una única vez
   *       404:
   *         description: Sin siembra de práctica activa
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 key: { type: string, example: siembra-demo-no-encontrada }
   *       409:
   *         description: Siembra de otra unidad de negocio
   *       429:
   *         description: Tope de intentos alcanzado
   */
  async regenerateCredentials(ctx: HttpContext) {
    const { auth, businessUnitScope, i18n } = ctx
    const userId = auth.user!.userId
    const service = new DemoSeedService(i18n)

    try {
      const data = await service.regenerateCredentials(userId, businessUnitScope[0])
      return ctx.response.status(200).json({
        type: 'success',
        title: 'Onboarding',
        message: 'Credencial de práctica regenerada correctamente.',
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers de respuesta de error (patrón del área — state.controller)
  // ---------------------------------------------------------------------------

  private domainError(ctx: HttpContext, error: unknown) {
    if (error instanceof OnboardingError) {
      const status = ONBOARDING_ERROR_STATUS[error.key as OnboardingErrorKey] ?? 500
      return ctx.response.status(status).json({
        type: status >= 500 ? 'error' : status === 404 ? 'warning' : 'error',
        title: error.title,
        message: error.detail,
        detail: error.detail,
        key: error.key,
      })
    }
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return ctx.response.status(500).json({
      type: 'error',
      title: 'Error del servidor',
      message: 'Ocurrió un error inesperado en el servidor.',
      error: message,
    })
  }
}
