import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { respondAssetsModuleError } from './assets.error.js'
import AssetsService from './assets.service.js'
import { employeeIdParamsValidator } from './validators/assets.validator.js'

/**
 * Lecturas por colaborador del módulo Activos. La ficha del colaborador del BO
 * las consume con el permiso `supplies:read`; el colaborador inexistente y el
 * de otra empresa responden el mismo 404 (IDOR indistinguible).
 */
@inject()
export default class EmployeeAssetsController {
  constructor(private readonly service: AssetsService) {}

  /**
   * @swagger
   * /api/employees/{employeeId}/assets:
   *   get:
   *     summary: Activos asignados a un colaborador
   *     description: |
   *       Vigentes (`current`) y devueltos (`history`) del colaborador. Un
   *       colaborador dado de baja sigue consultable; el inexistente y el de
   *       otra empresa responden el mismo 404. Sin archivos, fotos ni
   *       `businessUnitId`.
   *     tags: [Assets]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - { in: header, name: X-Business-Unit-Id, required: true, schema: { type: string } }
   *       - { in: path, name: employeeId, required: true, schema: { type: integer } }
   *     responses:
   *       '200':
   *         description: Activos del colaborador.
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Activos del colaborador
   *               message: Activos del colaborador obtenidos correctamente
   *               data:
   *                 employeeId: 57
   *                 employeeSlug: "3f1c0e9a-..."
   *                 current:
   *                   - employeeSupplyId: 912
   *                     status: active
   *                     assignedAt: "2026-08-01"
   *                     expiresAt: null
   *                     retirementDate: null
   *                     retirementReason: null
   *                     custodyStatus: signed
   *                     asset:
   *                       supplyId: 31
   *                       name: "Laptop Dell"
   *                       fileNumber: "ACT-0031"
   *                       serialNumber: "SN-998"
   *                       status: active
   *                       isDeleted: false
   *                       supplyType: { supplyTypeId: 4, name: "Laptop" }
   *                       characteristics:
   *                         - { characteristicId: 7, name: "Modelo", type: text, value: "Latitude 5440" }
   *                 history:
   *                   - employeeSupplyId: 640
   *                     status: retired
   *                     assignedAt: "2026-01-10"
   *                     expiresAt: null
   *                     retirementDate: "2026-09-01"
   *                     retirementReason: "Cambio de equipo"
   *                     custodyStatus: unsigned
   *                     asset: {}
   *       '403': { description: "Sin `supplies:read` (gate)." }
   *       '404':
   *         description: "`key: colaborador-no-encontrado` (inexistente o de otra empresa)."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   *       '422':
   *         description: "`key: entrada-invalida` (`:employeeId` no numérico, 0 o negativo)."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   */
  async assets(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      const { employeeId } = await employeeIdParamsValidator.validate(params)
      const data = await this.service.employeeAssets(employeeId)
      return response.status(200).json({
        type: 'success',
        title: i18n.t('asset_employee_assets_title', undefined, 'Activos del colaborador'),
        message: i18n.t(
          'asset_employee_assets_successfully',
          undefined,
          'Activos del colaborador obtenidos correctamente'
        ),
        data,
      })
    } catch (error) {
      return respondAssetsModuleError(ctx, error)
    }
  }
}
