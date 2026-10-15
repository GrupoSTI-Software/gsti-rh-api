import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { errors as vineErrors } from '@vinejs/vine'
import type { SupplyTypeTeleworkCategory } from '#constants/supply_type_telework_category'
import { AssetError, respondAssetsModuleError } from './assets.error.js'
import OwnEquipmentDeclarationsService from './own_equipment_declarations.service.js'
import { employeeIdParamsValidator } from './validators/assets.validator.js'
import { createOwnEquipmentDeclarationValidator } from './validators/own_equipment_declarations.validator.js'

/**
 * Alta de la declaración del uso de equipo propio con su cuota
 * (VLRH-H1791306075599). Controlador delgado: valida, delega en el servicio y
 * arma la respuesta. La ruta va con `auth` + `businessScope` y el gate de
 * Empleados (`employees:manage-employee-supplies`).
 *
 * Errores con el contrato del módulo: `type/title/message/detail/key`, sin
 * `code`. Un solo mapeo propio: un fallo de Vine sobre `category` se responde
 * como `categoria-de-insumo-invalida`; el resto de los fallos de validación los
 * traduce `respondAssetsModuleError` a `entrada-invalida`.
 */
@inject()
export default class OwnEquipmentDeclarationsController {
  constructor(private readonly service: OwnEquipmentDeclarationsService) {}

  /**
   * @swagger
   * /api/employees/{employeeId}/own-equipment-declarations:
   *   post:
   *     summary: Declarar el uso de equipo propio con su cuota
   *     description: |
   *       Alta de una declaración vigente del colaborador en una de las tres
   *       categorías de la norma (NOM-037-STPS-2023). El colaborador debe estar
   *       vivo, en el alcance de empresas de la petición y teletrabajar
   *       (porcentaje mayor a 0); la categoría no puede estar cubierta por un
   *       activo asignado o en envío, ni tener ya una declaración vigente. La
   *       cuota llega cruda (`monthlyFee`) y se valida por texto; `fee_source`
   *       y `status` los fija el servidor y la empresa sale de la fila del
   *       colaborador, nunca del body.
   *     tags: [Assets]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - { in: header, name: X-Business-Unit-Id, required: true, schema: { type: string } }
   *       - { in: path, name: employeeId, required: true, schema: { type: integer } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [category, description, startDate, monthlyFee]
   *             properties:
   *               category: { type: string, enum: [ergonomic_chair, computing_equipment, accessory] }
   *               description: { type: string, maxLength: 255 }
   *               conditions: { type: string, maxLength: 2000, nullable: true }
   *               startDate: { type: string, format: date, example: "2026-11-01" }
   *               monthlyFee: { type: number, example: 350, description: "0 o más, hasta dos decimales, sin exceder 99999999.99" }
   *           example:
   *             category: ergonomic_chair
   *             description: Silla de oficina con respaldo ajustable
   *             conditions: Buen estado; uso exclusivo para trabajo
   *             startDate: "2026-11-01"
   *             monthlyFee: 350
   *     responses:
   *       '201':
   *         description: Declaración guardada.
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Declaración de equipo propio
   *               message: Declaración de equipo propio guardada
   *               data:
   *                 declarationId: 41
   *                 employeeId: 57
   *                 category: ergonomic_chair
   *                 description: Silla de oficina con respaldo ajustable
   *                 conditions: Buen estado; uso exclusivo para trabajo
   *                 startDate: "2026-11-01"
   *                 monthlyFee: 350
   *                 status: active
   *                 createdAt: "2026-11-01T16:02:11.000Z"
   *       '403': { description: "Sin `employees:manage-employee-supplies` (gate)." }
   *       '404':
   *         description: "`key: colaborador-no-encontrado` (ajeno, inexistente o dado de baja)."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   *       '409':
   *         description: "`categoria-cubierta-por-activo` o `declaracion-de-equipo-propio-vigente-existente`."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   *       '422':
   *         description: |
   *           `categoria-de-insumo-invalida`, `colaborador-sin-teletrabajo`,
   *           `cuota-de-equipo-propio-invalida` o `entrada-invalida`.
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   *       '500':
   *         description: "`key: error-inesperado` (detalle fijo, sin `error.message`)."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   */
  async store(ctx: HttpContext) {
    const { params, request, response, auth, i18n } = ctx
    try {
      const { employeeId } = await employeeIdParamsValidator.validate(params)

      let input: {
        category: SupplyTypeTeleworkCategory
        description: string
        conditions?: string
        startDate: string
      }
      try {
        input = await request.validateUsing(createOwnEquipmentDeclarationValidator)
      } catch (error) {
        // Una categoría fuera de las tres es de negocio (`categoria-de-insumo-invalida`),
        // no un `entrada-invalida` genérico.
        if (
          error instanceof vineErrors.E_VALIDATION_ERROR &&
          (error.messages as Array<{ field?: string }>).some((message) => message.field === 'category')
        ) {
          throw AssetError.teleworkCategoryInvalid()
        }
        throw error
      }

      // La cuota no pasa por Vine: se entrega cruda para validarla por texto.
      const rawMonthlyFee = request.input('monthlyFee')
      const userId = auth.getUserOrFail().userId

      const data = await this.service.create(
        employeeId,
        {
          category: input.category,
          description: input.description,
          conditions: input.conditions ?? null,
          startDate: input.startDate,
        },
        rawMonthlyFee,
        userId
      )

      return response.status(201).json({
        type: 'success',
        title: i18n.t(
          'own_equipment_declaration_created_title',
          undefined,
          'Declaración de equipo propio'
        ),
        message: i18n.t(
          'own_equipment_declaration_created_message',
          undefined,
          'Declaración de equipo propio guardada'
        ),
        data,
      })
    } catch (error) {
      return respondAssetsModuleError(ctx, error)
    }
  }
}
