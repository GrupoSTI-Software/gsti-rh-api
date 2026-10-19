import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { errors as vineErrors } from '@vinejs/vine'
import type { SupplyTypeTeleworkCategory } from '#constants/supply_type_telework_category'
import { AssetError, respondAssetsModuleError } from './assets.error.js'
import OwnEquipmentDeclarationsService from './own_equipment_declarations.service.js'
import { employeeIdParamsValidator } from './validators/assets.validator.js'
import {
  adjustOwnEquipmentDeclarationValidator,
  closeOwnEquipmentDeclarationValidator,
  createOwnEquipmentDeclarationValidator,
  declarationIdParamsValidator,
} from './validators/own_equipment_declarations.validator.js'

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
   *       cuota llega cruda (`monthlyFee`) y se valida por texto; si no viene se
   *       precarga con la estándar configurada de la empresa y, si tampoco
   *       existe, se rechaza. `fee_source` y `status` los fija el servidor y la
   *       empresa sale de la fila del colaborador, nunca del body.
   *
   *       El alta viaja como `multipart/form-data` y acepta un archivo opcional
   *       `file` con la evidencia del equipo (PDF o foto, hasta 10 MB): se sube
   *       con el perfil `evidence-document` —que valida el contenido real y
   *       re-encodea las imágenes a JPEG— después de las validaciones baratas y
   *       antes de la transacción, y su rechazo responde con el sobre del intake
   *       (`key`/`code`, p. ej. `contenido-no-corresponde`).
   *     tags: [Assets]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - { in: header, name: X-Business-Unit-Id, required: true, schema: { type: string } }
   *       - { in: path, name: employeeId, required: true, schema: { type: integer } }
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [category, description, startDate]
   *             properties:
   *               category: { type: string, enum: [ergonomic_chair, computing_equipment, accessory] }
   *               description: { type: string, maxLength: 255 }
   *               conditions: { type: string, maxLength: 2000, nullable: true }
   *               startDate: { type: string, format: date, example: "2026-11-01" }
   *               monthlyFee: { type: number, example: 350, description: "Opcional: 0 o más, hasta dos decimales, sin exceder 99999999.99. Si falta, se precarga con la cuota estándar de la empresa; sin estándar, es obligatoria." }
   *               file: { type: string, format: binary, description: "Opcional: evidencia del equipo (PDF, JPG, PNG o WEBP de hasta 10 MB)." }
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
   *                 hasEvidence: true
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
   *           `cuota-de-equipo-propio-invalida` o `entrada-invalida`; o el
   *           rechazo del intake del archivo (título `Archivo no aceptado` con
   *           su `key`/`code`: `extension-no-permitida`, `contenido-no-corresponde`
   *           o `archivo-demasiado-grande`).
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   *       '500':
   *         description: "`key: error-inesperado` (detalle fijo, sin `error.message`) o `archivo-no-almacenado` si falla la subida."
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
      // El archivo tampoco pasa por Vine: lo valida el intake con su perfil
      // (`evidence-document`) y el servicio lo sube tras las validaciones baratas.
      const file = request.file('file')
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
        file,
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

  /**
   * @swagger
   * /api/own-equipment-declarations/{declarationId}:
   *   put:
   *     summary: Ajustar la declaración de equipo propio (versionado)
   *     description: |
   *       Cierra la declaración vigente el día civil anterior a la fecha de
   *       vigencia y abre la versión nueva en la misma transacción. La cuota, la
   *       descripción y las condiciones son opcionales: lo que no llega se
   *       hereda de la versión vigente (`conditions: null` limpia). El ajuste
   *       debe cambiar algo y la fecha de vigencia debe ser posterior al inicio
   *       de la vigente. La empresa, el colaborador y la categoría salen de la
   *       fila vieja; `fee_source` y `status` los fija el servidor.
   *     tags: [Assets]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - { in: header, name: X-Business-Unit-Id, required: true, schema: { type: string } }
   *       - { in: path, name: declarationId, required: true, schema: { type: integer } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [monthlyFee]
   *             properties:
   *               effectiveDate: { type: string, format: date, example: "2026-11-01", description: "Opcional: posterior al inicio de la vigente. Si falta, el día de hoy." }
   *               description: { type: string, maxLength: 255 }
   *               conditions: { type: string, maxLength: 2000, nullable: true, description: "Opcional: `null` limpia las condiciones." }
   *               monthlyFee: { type: number, example: 420, description: "Requerida: 0 o más, hasta dos decimales, sin exceder 99999999.99. Si falta, el ajuste se rechaza." }
   *           example:
   *             effectiveDate: "2026-11-01"
   *             monthlyFee: 420
   *     responses:
   *       '200':
   *         description: Versión nueva guardada; la anterior quedó cerrada.
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Declaración de equipo propio
   *               message: Declaración de equipo propio ajustada
   *               data:
   *                 declarationId: 42
   *                 employeeId: 57
   *                 category: ergonomic_chair
   *                 description: Silla de oficina con respaldo ajustable
   *                 conditions: Buen estado; uso exclusivo para trabajo
   *                 startDate: "2026-11-01"
   *                 endDate: null
   *                 monthlyFee: 420
   *                 feeSource: adjusted
   *                 status: active
   *                 closedReason: null
   *                 createdAt: "2026-11-01T16:02:11.000Z"
   *       '403': { description: "Sin `employees:manage-employee-supplies` (gate)." }
   *       '404':
   *         description: "`declaracion-de-equipo-propio-no-encontrada` (ajena, inexistente o borrada) o `colaborador-no-encontrado` (dado de baja)."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   *       '409':
   *         description: "`declaracion-de-equipo-propio-no-vigente`, `categoria-cubierta-por-activo` o `declaracion-de-equipo-propio-vigente-existente`."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   *       '422':
   *         description: |
   *           `cuota-de-equipo-propio-invalida`, `colaborador-sin-teletrabajo` o
   *           `entrada-invalida` (fecha de vigencia o ajuste sin cambios).
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   *       '500':
   *         description: "`key: error-inesperado` (detalle fijo, sin `error.message`)."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   */
  async update(ctx: HttpContext) {
    const { params, request, response, auth, i18n } = ctx
    try {
      const { declarationId } = await declarationIdParamsValidator.validate(params)
      const input = await request.validateUsing(adjustOwnEquipmentDeclarationValidator)

      // La cuota no pasa por Vine: se entrega cruda para validarla por texto.
      const rawMonthlyFee = request.input('monthlyFee')
      const userId = auth.getUserOrFail().userId

      const data = await this.service.adjust(declarationId, input, rawMonthlyFee, userId)

      return response.status(200).json({
        type: 'success',
        title: i18n.t(
          'own_equipment_declaration_adjusted_title',
          undefined,
          'Declaración de equipo propio'
        ),
        message: i18n.t(
          'own_equipment_declaration_adjusted_message',
          undefined,
          'Declaración de equipo propio ajustada'
        ),
        data,
      })
    } catch (error) {
      return respondAssetsModuleError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/own-equipment-declarations/{declarationId}/close:
   *   post:
   *     summary: Terminar la declaración de equipo propio
   *     description: |
   *       Cierra la declaración vigente con su fecha de fin y un motivo del
   *       catálogo (`adjusted` queda fuera: solo lo pone el sistema al ajustar).
   *       La fecha de fin es opcional —por omisión, el día de hoy en zona de
   *       negocio— y el borde es inclusivo: una fecha igual al inicio es válida;
   *       una anterior se rechaza. El término solo bloquea la DECLARACIÓN, nunca
   *       el colaborador: procede con el colaborador dado de baja o sin
   *       teletrabajo. La empresa sale del alcance de la petición, nunca del body.
   *     tags: [Assets]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - { in: header, name: X-Business-Unit-Id, required: true, schema: { type: string } }
   *       - { in: path, name: declarationId, required: true, schema: { type: integer } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [closedReason]
   *             properties:
   *               endDate: { type: string, format: date, example: "2026-11-30", description: "Opcional: posterior o igual al inicio. Si falta, el día de hoy en zona de negocio." }
   *               closedReason: { type: string, enum: [company_equipment_assigned, telework_ended, conditions_changed, other], description: "Motivo del catálogo. `adjusted` no es seleccionable: lo pone el sistema al ajustar." }
   *           example:
   *             endDate: "2026-11-30"
   *             closedReason: telework_ended
   *     responses:
   *       '200':
   *         description: Declaración terminada.
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Declaración de equipo propio
   *               message: Declaración de equipo propio terminada
   *               data:
   *                 declarationId: 41
   *                 employeeId: 57
   *                 category: ergonomic_chair
   *                 description: Silla de oficina con respaldo ajustable
   *                 conditions: Buen estado; uso exclusivo para trabajo
   *                 startDate: "2026-09-01"
   *                 endDate: "2026-11-30"
   *                 monthlyFee: 350
   *                 feeSource: adjusted
   *                 status: closed
   *                 closedReason: telework_ended
   *                 createdAt: "2026-09-01T16:02:11.000Z"
   *       '403': { description: "Sin `employees:manage-employee-supplies` (gate)." }
   *       '404':
   *         description: "`declaracion-de-equipo-propio-no-encontrada` (ajena, inexistente o borrada)."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   *       '409':
   *         description: "`declaracion-de-equipo-propio-no-vigente` (ya cerrada)."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   *       '422':
   *         description: |
   *           `entrada-invalida` (motivo ausente, `adjusted` o literal fuera del
   *           catálogo; fecha de fin inválida o anterior al inicio).
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   *       '500':
   *         description: "`key: error-inesperado` (detalle fijo, sin `error.message`)."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   */
  async close(ctx: HttpContext) {
    const { params, request, response, auth, i18n } = ctx
    try {
      const { declarationId } = await declarationIdParamsValidator.validate(params)
      const input = await request.validateUsing(closeOwnEquipmentDeclarationValidator)
      const userId = auth.getUserOrFail().userId

      const data = await this.service.close(declarationId, input, userId)

      return response.status(200).json({
        type: 'success',
        title: i18n.t(
          'own_equipment_declaration_closed_title',
          undefined,
          'Declaración de equipo propio'
        ),
        message: i18n.t(
          'own_equipment_declaration_closed_message',
          undefined,
          'Declaración de equipo propio terminada'
        ),
        data,
      })
    } catch (error) {
      return respondAssetsModuleError(ctx, error)
    }
  }
}
