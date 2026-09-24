import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { respondAssetsModuleError } from './assets.error.js'
import AssetsService from './assets.service.js'
import {
  assetIdParamsValidator,
  assetsSummaryValidator,
  listAssetsValidator,
  upsertCharacteristicValuesValidator,
} from './validators/assets.validator.js'

/**
 * Activos del backoffice (rediseño: la unidad es el activo, no el tipo).
 * Controlador delgado: valida, delega en el service y arma la respuesta.
 * Todas las rutas van con `auth` + `businessScope`; el permiso lo pone el gate
 * de la ruta (`SUPPLIES_PERMISSION_DECLARATIONS`).
 *
 * Errores con el contrato del repo: `type/title/message/detail/key`.
 *
 * @swagger
 * components:
 *   schemas:
 *     AssetEmployee:
 *       type: object
 *       properties:
 *         employeeId: { type: integer, example: 57 }
 *         employeeSlug: { type: string, example: "3f1c0e9a-4b7d-4c43-9f3e-0b8c2a1d6e55" }
 *         employeePhoto: { type: string, nullable: true, description: "Ruta guardada; la imagen se sirve en GET /api/employees/{id}/photo" }
 *         name: { type: string, example: "Ana López Ruiz" }
 *         positionName: { type: string, nullable: true, example: "Analista" }
 *         departmentName: { type: string, nullable: true, example: "Finanzas" }
 *         branchName: { type: string, nullable: true, example: "Matriz" }
 *     AssetActiveAssignment:
 *       type: object
 *       nullable: true
 *       properties:
 *         employeeSupplyId: { type: integer, example: 912 }
 *         assignedAt: { type: string, format: date, example: "2026-08-01" }
 *         expiresAt: { type: string, format: date, nullable: true, example: "2027-08-01" }
 *         notes: { type: string, nullable: true, example: "Incluye cargador" }
 *         employee: { $ref: '#/components/schemas/AssetEmployee' }
 *     AssetListItem:
 *       type: object
 *       properties:
 *         supplyId: { type: integer, example: 31 }
 *         name: { type: string, example: "Laptop Dell Latitude 5440" }
 *         fileNumber: { type: string, example: "LAP-0012" }
 *         serialNumber: { type: string, nullable: true, example: "5CG1234XYZ" }
 *         description: { type: string, nullable: true }
 *         status: { type: string, enum: [active, inactive, lost, damaged] }
 *         deactivationReason: { type: string, nullable: true }
 *         deactivationDate: { type: string, format: date, nullable: true }
 *         supplyType:
 *           type: object
 *           properties:
 *             supplyTypeId: { type: integer, example: 4 }
 *             name: { type: string, example: "Laptop" }
 *         acquisitionValue: { type: number, nullable: true, example: 18500 }
 *         acquisitionDate: { type: string, format: date, nullable: true, example: "2026-01-15" }
 *         currentValue:
 *           type: number
 *           nullable: true
 *           example: 15200
 *           description: Último registro del historial; sin historial, el de adquisición (respeta 0).
 *         activeAssignment: { $ref: '#/components/schemas/AssetActiveAssignment' }
 *     AssetCharacteristicValue:
 *       type: object
 *       properties:
 *         characteristicId: { type: integer, example: 7 }
 *         name: { type: string, example: "RAM (GB)" }
 *         type: { type: string, enum: [text, number, date, boolean] }
 *         value: { type: string, nullable: true, example: "16" }
 *     AssetError:
 *       type: object
 *       properties:
 *         type: { type: string, example: error }
 *         title: { type: string }
 *         message: { type: string }
 *         detail: { type: string }
 *         key: { type: string }
 *         data: { nullable: true, example: null }
 */
@inject()
export default class AssetsController {
  constructor(private readonly service: AssetsService) {}

  /**
   * @swagger
   * /api/assets:
   *   get:
   *     summary: Listado paginado de activos con su resguardo activo
   *     description: |
   *       Una consulta por página (joins y subconsultas, sin N+1), ordenada por
   *       nombre. `search` busca, sin distinguir mayúsculas, en nombre, folio,
   *       serie, nombre del tipo y nombre del colaborador del resguardo activo.
   *       `state`: `available` = activo sin resguardo activo; `assigned` =
   *       activo con resguardo activo; `retired` = estado distinto de `active`.
   *     tags: [Assets]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - { in: header, name: X-Business-Unit-Id, required: true, schema: { type: string } }
   *       - { in: query, name: search, schema: { type: string, maxLength: 150 } }
   *       - { in: query, name: supplyTypeId, schema: { type: integer } }
   *       - { in: query, name: state, schema: { type: string, enum: [all, available, assigned, retired], default: all } }
   *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
   *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 500, default: 20 } }
   *     responses:
   *       '200':
   *         description: Activos de la página.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type: { type: string, example: success }
   *                 title: { type: string, example: Activos }
   *                 message: { type: string, example: Activos obtenidos correctamente }
   *                 data:
   *                   type: object
   *                   properties:
   *                     meta:
   *                       type: object
   *                       properties:
   *                         total: { type: integer, example: 42 }
   *                         perPage: { type: integer, example: 20 }
   *                         currentPage: { type: integer, example: 1 }
   *                         lastPage: { type: integer, example: 3 }
   *                     data:
   *                       type: array
   *                       items: { $ref: '#/components/schemas/AssetListItem' }
   *       '403': { description: "Sin `supplies:read` (gate)." }
   *       '422':
   *         description: "Query inválida (`key: entrada-invalida`)."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      const query = await listAssetsValidator.validate(request.qs())
      const data = await this.service.list(query)
      return response.status(200).json({
        type: 'success',
        title: i18n.t('asset_title', undefined, 'Activos'),
        message: i18n.t('asset_listed_successfully', undefined, 'Activos obtenidos correctamente'),
        data,
      })
    } catch (error) {
      return respondAssetsModuleError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/assets/summary:
   *   get:
   *     summary: Indicadores de activos en operación
   *     description: |
   *       Solo activos `active` (no borrados). `assigned` = con resguardo
   *       activo. `totalValue` y `unassignedValue` suman el valor vigente
   *       (último del historial; sin historial, el de adquisición; sin valor, 0).
   *     tags: [Assets]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - { in: header, name: X-Business-Unit-Id, required: true, schema: { type: string } }
   *       - { in: query, name: supplyTypeId, schema: { type: integer } }
   *     responses:
   *       '200':
   *         description: Indicadores.
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Resumen de activos
   *               message: Resumen de activos obtenido correctamente
   *               data: { inOperation: 40, assigned: 31, totalValue: 612500, unassignedValue: 98000 }
   *       '403': { description: "Sin `supplies:read` (gate)." }
   */
  async summary(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      const { supplyTypeId } = await assetsSummaryValidator.validate(request.qs())
      const data = await this.service.summary(supplyTypeId)
      return response.status(200).json({
        type: 'success',
        title: i18n.t('asset_summary_title', undefined, 'Resumen de activos'),
        message: i18n.t(
          'asset_summary_successfully',
          undefined,
          'Resumen de activos obtenido correctamente'
        ),
        data,
      })
    } catch (error) {
      return respondAssetsModuleError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/assets/{supplyId}:
   *   get:
   *     summary: Ficha del activo
   *     description: |
   *       El item del listado más `characteristicValues`: todas las
   *       características vivas del tipo, con el valor del activo o `null`.
   *     tags: [Assets]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - { in: header, name: X-Business-Unit-Id, required: true, schema: { type: string } }
   *       - { in: path, name: supplyId, required: true, schema: { type: integer } }
   *     responses:
   *       '200':
   *         description: Activo.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type: { type: string, example: success }
   *                 title: { type: string, example: Activo }
   *                 message: { type: string, example: Activo obtenido correctamente }
   *                 data:
   *                   allOf:
   *                     - $ref: '#/components/schemas/AssetListItem'
   *                     - type: object
   *                       properties:
   *                         characteristicValues:
   *                           type: array
   *                           items: { $ref: '#/components/schemas/AssetCharacteristicValue' }
   *       '403': { description: "Sin `supplies:read` (gate)." }
   *       '404':
   *         description: "Inexistente, borrado o de otra empresa (`key: activo-no-encontrado`)."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   */
  async show(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      const { supplyId } = await assetIdParamsValidator.validate(params)
      const data = await this.service.detail(supplyId)
      return response.status(200).json({
        type: 'success',
        title: i18n.t('asset_detail_title', undefined, 'Activo'),
        message: i18n.t('asset_found_successfully', undefined, 'Activo obtenido correctamente'),
        data,
      })
    } catch (error) {
      return respondAssetsModuleError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/assets/{supplyId}/assignments:
   *   get:
   *     summary: Historial de resguardos del activo
   *     description: |
   *       Todos los estados (`active`, `retired`, `shipping`), del más reciente
   *       al más antiguo por fecha de asignación. Cada resguardo trae sus
   *       responsivas (`contracts`, descarga en
   *       `/api/employee-supplies-response-contracts/{id}/file`) y fotos
   *       (`photos`, descarga en
   *       `/api/employee-supply-assignation-photos/photo/{photoId}/file`).
   *     tags: [Assets]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - { in: header, name: X-Business-Unit-Id, required: true, schema: { type: string } }
   *       - { in: path, name: supplyId, required: true, schema: { type: integer } }
   *     responses:
   *       '200':
   *         description: Resguardos.
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Resguardos del activo
   *               message: Resguardos del activo obtenidos correctamente
   *               data:
   *                 - employeeSupplyId: 912
   *                   status: retired
   *                   assignedAt: "2026-01-20"
   *                   expiresAt: null
   *                   notes: "Incluye cargador"
   *                   retirementReason: "Cambio de equipo"
   *                   retirementDate: "2026-08-01"
   *                   employee: { employeeId: 57, employeeSlug: "3f1c0e9a-...", employeePhoto: null, name: "Ana López Ruiz", positionName: "Analista" }
   *                   contracts: [{ id: 88, fileName: "responsiva.pdf" }]
   *                   photos: [{ photoId: 301, kind: assignation }, { photoId: 322, kind: return }]
   *       '403': { description: "Sin `supplies:read` (gate)." }
   *       '404':
   *         description: "`key: activo-no-encontrado`."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   */
  async assignments(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      const { supplyId } = await assetIdParamsValidator.validate(params)
      const data = await this.service.assignments(supplyId)
      return response.status(200).json({
        type: 'success',
        title: i18n.t('asset_assignments_title', undefined, 'Resguardos del activo'),
        message: i18n.t(
          'asset_assignments_successfully',
          undefined,
          'Resguardos del activo obtenidos correctamente'
        ),
        data,
      })
    } catch (error) {
      return respondAssetsModuleError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/assets/{supplyId}/value-history:
   *   get:
   *     summary: Historial de valor del activo
   *     description: |
   *       `acquisition` es el valor y la fecha de adquisición del activo;
   *       `entries`, los registros vivos del historial del más reciente al más
   *       antiguo (`amount` = valor registrado). El alta con valor de
   *       adquisición crea el primer registro ("Valor de adquisición").
   *     tags: [Assets]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - { in: header, name: X-Business-Unit-Id, required: true, schema: { type: string } }
   *       - { in: path, name: supplyId, required: true, schema: { type: integer } }
   *     responses:
   *       '200':
   *         description: Historial.
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Historial de valor
   *               message: Historial de valor obtenido correctamente
   *               data:
   *                 acquisition: { value: 18500, date: "2026-01-15" }
   *                 entries:
   *                   - { supplyValueHistoryId: 12, amount: 15200, notes: "Depreciación anual", recordedAt: "2026-09-01T16:00:00.000Z" }
   *                   - { supplyValueHistoryId: 9, amount: 18500, notes: "Valor de adquisición", recordedAt: "2026-01-15T17:30:00.000Z" }
   *       '403': { description: "Sin `supplies:read` (gate)." }
   *       '404':
   *         description: "`key: activo-no-encontrado`."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   */
  async valueHistory(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      const { supplyId } = await assetIdParamsValidator.validate(params)
      const data = await this.service.valueHistory(supplyId)
      return response.status(200).json({
        type: 'success',
        title: i18n.t('asset_value_history_title', undefined, 'Historial de valor'),
        message: i18n.t(
          'asset_value_history_successfully',
          undefined,
          'Historial de valor obtenido correctamente'
        ),
        data,
      })
    } catch (error) {
      return respondAssetsModuleError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/assets/{supplyId}/characteristic-values:
   *   put:
   *     summary: Guardar en lote los valores de características del activo
   *     description: |
   *       Upsert por característica: actualiza el valor vivo, crea el que
   *       falta y quita el que llega `null` o vacío. Cada característica debe
   *       ser del tipo del activo y el valor respetar su formato: `number`
   *       numérico, `date` `YYYY-MM-DD`, `boolean` true/false. Devuelve todas
   *       las características del tipo con su valor.
   *     tags: [Assets]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - { in: header, name: X-Business-Unit-Id, required: true, schema: { type: string } }
   *       - { in: path, name: supplyId, required: true, schema: { type: integer } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [values]
   *             properties:
   *               values:
   *                 type: array
   *                 minItems: 1
   *                 maxItems: 200
   *                 items:
   *                   type: object
   *                   required: [characteristicId, value]
   *                   properties:
   *                     characteristicId: { type: integer }
   *                     value: { nullable: true, oneOf: [{ type: string, maxLength: 1000 }, { type: number }, { type: boolean }] }
   *           example:
   *             values: [{ characteristicId: 7, value: 16 }, { characteristicId: 8, value: "2027-01-31" }]
   *     responses:
   *       '200':
   *         description: Valores guardados.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type: { type: string, example: success }
   *                 title: { type: string, example: Características del activo }
   *                 message: { type: string, example: Características del activo guardadas correctamente }
   *                 data:
   *                   type: array
   *                   items: { $ref: '#/components/schemas/AssetCharacteristicValue' }
   *       '403': { description: "Sin `supplies:update` (gate)." }
   *       '404':
   *         description: "`key: activo-no-encontrado`."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   *       '422':
   *         description: |
   *           `caracteristica-no-pertenece-al-tipo`, `valor-de-caracteristica-invalido`
   *           o `entrada-invalida`.
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   */
  async upsertCharacteristicValues(ctx: HttpContext) {
    const { params, request, response, i18n } = ctx
    try {
      const { supplyId } = await assetIdParamsValidator.validate(params)
      const { values } = await request.validateUsing(upsertCharacteristicValuesValidator)
      const data = await this.service.upsertCharacteristicValues(supplyId, values)
      return response.status(200).json({
        type: 'success',
        title: i18n.t('asset_characteristic_values_title', undefined, 'Características del activo'),
        message: i18n.t(
          'asset_characteristic_values_saved',
          undefined,
          'Características del activo guardadas correctamente'
        ),
        data,
      })
    } catch (error) {
      return respondAssetsModuleError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/asset-types:
   *   get:
   *     summary: Tipos de activo con conteo y características
   *     description: "`suppliesCount` cuenta activos no borrados del tipo (cualquier estado)."
   *     tags: [Assets]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - { in: header, name: X-Business-Unit-Id, required: true, schema: { type: string } }
   *     responses:
   *       '200':
   *         description: Tipos ordenados por nombre.
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Tipos de activo
   *               message: Tipos de activo obtenidos correctamente
   *               data:
   *                 - supplyTypeId: 4
   *                   name: Laptop
   *                   slug: laptop
   *                   description: null
   *                   suppliesCount: 12
   *                   characteristics: [{ characteristicId: 7, name: "RAM (GB)", type: number }]
   *       '403': { description: "Sin `supplies:read` (gate)." }
   */
  async types(ctx: HttpContext) {
    const { response, i18n } = ctx
    try {
      const data = await this.service.types()
      return response.status(200).json({
        type: 'success',
        title: i18n.t('asset_types_title', undefined, 'Tipos de activo'),
        message: i18n.t('asset_types_successfully', undefined, 'Tipos de activo obtenidos correctamente'),
        data,
      })
    } catch (error) {
      return respondAssetsModuleError(ctx, error)
    }
  }
}
