import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import RepsePanoramaService from './repse_panorama.service.js'

export default class RepsePanoramaController {
  /**
   * @swagger
   * /api/repse/panorama:
   *   get:
   *     summary: Panorama REPSE — KPIs y pendientes del tenant
   *     description: |
   *       KPIs del módulo y pendientes accionables. El API no arma textos: el cliente
   *       traduce cada pendiente por su `tipo`.
   *
   *       - `informativa` aparece primero si faltan 30 días o menos para la próxima
   *         fecha de ley (17 ene/may/sep, zona de negocio).
   *       - Luego, por cada contrato con estatus efectivo vigente (incluye por vencer;
   *         vencidos, borradores y cancelados fuera), en orden de fechaFin ascendente
   *         (sin fechaFin al final):
   *         `contrato_por_vencer` (vigente con fechaFin a 45 días o menos),
   *         `contrato_sin_documento` (sin documento firmado vigente) y
   *         `personal_sin_asignar` (asignados vigentes hoy < declarados en el anexo 15-D).
   *
   *       Requiere `repse-registrations:read` (bypass expanded).
   *     tags: [RepsePanorama]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       '200':
   *         description: Panorama calculado
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Recursos
   *               message: Los recursos fueron encontrados correctamente
   *               data:
   *                 kpis:
   *                   contratosVigentes: 3
   *                   empresasContratantes: 2
   *                   serviciosActivos: 4
   *                   trabajadoresAsignados: 18
   *                 pendientes:
   *                   - tipo: informativa
   *                     fecha: '2027-01-17'
   *                     dias: 12
   *                   - tipo: contrato_por_vencer
   *                     contratoId: 7
   *                     numeroContrato: CSE-2026-007
   *                     empresaRazonSocial: Contratante SA de CV
   *                     fechaFin: '2026-10-03'
   *                     dias: 10
   *                   - tipo: contrato_sin_documento
   *                     contratoId: 9
   *                     numeroContrato: CSE-2026-009
   *                     empresaRazonSocial: Otra Contratante SA de CV
   *                   - tipo: personal_sin_asignar
   *                     contratoId: 9
   *                     numeroContrato: CSE-2026-009
   *                     empresaRazonSocial: Otra Contratante SA de CV
   *                     asignados: 1
   *                     declarados: 5
   *       '401':
   *         description: No autenticado
   *       '403':
   *         description: Permiso denegado o no resuelto (key PERM.DENIED o PERM.UNRESOLVED)
   *       '500':
   *         description: Error no clasificado (key `panorama-repse-no-disponible`)
   */
  async index(ctx: HttpContext) {
    const { response, i18n } = ctx
    if (!(await this.assertAuthenticated(ctx))) return

    try {
      const service = new RepsePanoramaService()
      const panorama = await service.getPanorama()

      return response.status(200).json({
        type: 'success',
        title: i18n.t('resources', undefined, 'Recursos'),
        message: i18n.t(
          'resources_were_found_successfully',
          undefined,
          'Los recursos fueron encontrados correctamente'
        ),
        data: panorama,
      })
    } catch (error) {
      logger.error({ err: error }, 'Error inesperado al calcular el panorama REPSE')
      return response.status(500).json({
        type: 'error',
        title: i18n.t('server_error', undefined, 'Error del servidor'),
        detail: i18n.t(
          'an_unexpected_error_has_occurred_on_the_server',
          undefined,
          'Ocurrió un error inesperado en el servidor'
        ),
        key: 'panorama-repse-no-disponible',
        data: null,
      })
    }
  }

  private async assertAuthenticated(ctx: HttpContext) {
    await ctx.auth.check()
    if (ctx.auth.user) return true

    ctx.response.status(401).json({
      type: 'error',
      title: ctx.i18n.t('unauthenticated', undefined, 'No autenticado'),
      detail: ctx.i18n.t('unauthenticated', undefined, 'No autenticado'),
      key: 'no-autenticado',
      data: null,
    })
    return false
  }
}
