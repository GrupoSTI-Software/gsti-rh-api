import type { HttpContext } from '@adonisjs/core/http'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { resolveEmployeeOffboardingApiError } from '#helpers/employee_offboarding_api_error'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'
import { EMPLOYEE_OFFBOARDING_ERROR_CODES } from '#constants/employee_offboarding_error_codes'
import ConceptsService from './concepts.service.js'
import { createOffboardingConceptValidator } from './validators/create_concept.validator.js'
import { updateOffboardingConceptValidator } from './validators/update_concept.validator.js'
import { reorderOffboardingConceptsValidator } from './validators/reorder_concepts.validator.js'

/**
 * Catálogo de conceptos de salida por empresa (USRH1786568279581).
 * Errores siempre `{ title, detail, key, code }`: el BO ramifica por `key`.
 */
export default class ConceptsController {
  /**
   * @swagger
   * /api/offboarding-concepts:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Conceptos de salida]
   *     summary: Lista el catálogo de conceptos de salida de la empresa activa
   *     description: |
   *       Devuelve la lista ordenada por lugar en la lista y luego por id.
   *       La PRIMERA consulta de una empresa siembra su conjunto base en la
   *       misma transacción (siembra perezosa, reglas 2 y 3); una empresa que
   *       vació su catálogo a propósito recibe lista vacía sin re-siembra.
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string, format: uuid }
   *         description: UUID público de la razón social activa
   *     responses:
   *       200:
   *         description: Lista en data.offboardingConcepts, ordenada por offboardingConceptOrder
   *       403:
   *         description: Sin permiso read sobre employee-offboardings (key sin-permiso)
   */
  async index({ auth, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new ConceptsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'read')
      const offboardingConcepts = await service.list(businessUnitScope)
      return StandardResponseFormatter.success(
        response,
        offboardingConcepts,
        i18n.formatMessage('employee_offboarding_concepts_title'),
        i18n.formatMessage('employee_offboarding_concepts_listed_message'),
        200,
        'offboardingConcepts'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/offboarding-concepts/{offboardingConceptId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Conceptos de salida]
   *     summary: Detalle de un concepto dentro del alcance
   *     parameters:
   *       - in: path
   *         name: offboardingConceptId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Concepto en data.offboardingConcept
   *       404:
   *         description: Inexistente o fuera del alcance (key concepto-no-encontrado, uniforme)
   */
  async show({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new ConceptsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'read')
      const offboardingConceptId = this.parseConceptId(request.param('offboardingConceptId'), i18n)
      const offboardingConcept = await service.show(offboardingConceptId, businessUnitScope)
      return StandardResponseFormatter.success(
        response,
        offboardingConcept,
        i18n.formatMessage('employee_offboarding_concepts_title'),
        i18n.formatMessage('employee_offboarding_concept_found_message'),
        200,
        'offboardingConcept'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/offboarding-concepts:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Conceptos de salida]
   *     summary: Crea un concepto manual al final de la lista de la empresa activa
   *     description: |
   *       `offboardingConceptSource` NO se acepta: todo concepto creado por el
   *       usuario nace 'manual'; el derivado del inventario solo nace en la
   *       siembra (regla 6).
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [offboardingConceptName]
   *             properties:
   *               offboardingConceptName: { type: string, maxLength: 150 }
   *               offboardingConceptDescription: { type: string, maxLength: 500, nullable: true }
   *               offboardingConceptRequiresEvidence: { type: boolean, default: false }
   *               offboardingConceptAllowsAmount: { type: boolean, default: false }
   *     responses:
   *       201:
   *         description: Concepto creado activo en el último lugar de la lista
   *       409:
   *         description: Nombre duplicado en la empresa (key concepto-nombre-duplicado)
   *       422:
   *         description: Empresa inexistente o fuera del alcance (key referencia-invalida)
   */
  async store({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new ConceptsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'create')
      const data = await request.validateUsing(createOffboardingConceptValidator)
      const offboardingConcept = await service.create(data, businessUnitScope)
      return StandardResponseFormatter.success(
        response,
        offboardingConcept,
        i18n.formatMessage('employee_offboarding_concepts_title'),
        i18n.formatMessage('employee_offboarding_concept_created_message'),
        201,
        'offboardingConcept'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/offboarding-concepts/reorder:
   *   patch:
   *     security:
   *       - bearerAuth: []
   *     tags: [Conceptos de salida]
   *     summary: Reordena el catálogo completo de la empresa activa (drag & drop)
   *     description: |
   *       La lista debe cubrir exactamente todos los conceptos vivos de la
   *       empresa; el API renumera 1..n en el orden recibido. Adelantado de
   *       USRH1786568279584 por decisión de producto.
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [orderedOffboardingConceptIds]
   *             properties:
   *               orderedOffboardingConceptIds:
   *                 type: array
   *                 items: { type: integer }
   *     responses:
   *       200:
   *         description: Lista completa en data.offboardingConcepts, ya renumerada
   *       422:
   *         description: Ids ajenos, duplicados o lista incompleta (key orden-invalido)
   */
  async reorder({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new ConceptsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'update')
      const data = await request.validateUsing(reorderOffboardingConceptsValidator)
      const offboardingConcepts = await service.reorder(
        data.orderedOffboardingConceptIds,
        businessUnitScope
      )
      return StandardResponseFormatter.success(
        response,
        offboardingConcepts,
        i18n.formatMessage('employee_offboarding_concepts_title'),
        i18n.formatMessage('employee_offboarding_concepts_reordered_message'),
        200,
        'offboardingConcepts'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/offboarding-concepts/{offboardingConceptId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags: [Conceptos de salida]
   *     summary: Actualiza nombre, descripción, exigencia de comprobante y admisión de importe
   *     description: |
   *       El concepto derivado del inventario acepta cambios de nombre,
   *       descripción y exigencia de comprobante, pero NUNCA admite importe
   *       ni cambia de naturaleza (regla 6).
   *     parameters:
   *       - in: path
   *         name: offboardingConceptId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [offboardingConceptName]
   *             properties:
   *               offboardingConceptName: { type: string, maxLength: 150 }
   *               offboardingConceptDescription: { type: string, maxLength: 500, nullable: true }
   *               offboardingConceptRequiresEvidence: { type: boolean }
   *               offboardingConceptAllowsAmount: { type: boolean }
   *     responses:
   *       200:
   *         description: Concepto actualizado
   *       404:
   *         description: Inexistente o fuera del alcance (key concepto-no-encontrado)
   *       409:
   *         description: Nombre duplicado en la empresa (key concepto-nombre-duplicado)
   *       422:
   *         description: Importe sobre el concepto derivado (key concepto-derivado-protegido)
   */
  async update({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new ConceptsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'update')
      const offboardingConceptId = this.parseConceptId(request.param('offboardingConceptId'), i18n)
      const data = await request.validateUsing(updateOffboardingConceptValidator)
      const offboardingConcept = await service.update(
        offboardingConceptId,
        data,
        businessUnitScope
      )
      return StandardResponseFormatter.success(
        response,
        offboardingConcept,
        i18n.formatMessage('employee_offboarding_concepts_title'),
        i18n.formatMessage('employee_offboarding_concept_updated_message'),
        200,
        'offboardingConcept'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/offboarding-concepts/{offboardingConceptId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags: [Conceptos de salida]
   *     summary: Baja lógica de un concepto ordinario (libera su nombre)
   *     description: |
   *       Marca `offboarding_concept_deleted_at`; el concepto deja de aparecer
   *       en la lista y su nombre queda disponible para un alta posterior
   *       (regla 8). El concepto derivado del inventario no se elimina (regla 6).
   *     parameters:
   *       - in: path
   *         name: offboardingConceptId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Concepto eliminado lógicamente
   *       404:
   *         description: Inexistente o fuera del alcance (key concepto-no-encontrado)
   *       422:
   *         description: Concepto derivado protegido (key concepto-derivado-protegido)
   */
  async destroy({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new ConceptsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'delete')
      const offboardingConceptId = this.parseConceptId(request.param('offboardingConceptId'), i18n)
      const offboardingConcept = await service.delete(offboardingConceptId, businessUnitScope)
      return StandardResponseFormatter.success(
        response,
        offboardingConcept,
        i18n.formatMessage('employee_offboarding_concepts_title'),
        i18n.formatMessage('employee_offboarding_concept_deleted_message'),
        200,
        'offboardingConcept'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  private parseConceptId(rawId: string, i18n: HttpContext['i18n']): number {
    const offboardingConceptId = Number.parseInt(rawId, 10)
    if (!Number.isInteger(offboardingConceptId) || offboardingConceptId < 1) {
      throw new EmployeeOffboardingServiceError({
        key: 'datos-invalidos',
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.VAL_INPUT,
        httpStatus: 400,
        title: i18n.formatMessage('employee_offboarding_val_input_title'),
        detail: i18n.formatMessage('employee_offboarding_val_input_message'),
      })
    }
    return offboardingConceptId
  }

  private respondWithError(
    response: HttpContext['response'],
    i18n: HttpContext['i18n'],
    error: unknown
  ) {
    const resolved = resolveEmployeeOffboardingApiError(error, i18n)
    response.status(resolved.status)
    return {
      title: resolved.title,
      detail: resolved.detail,
      key: resolved.key,
      code: resolved.code,
    }
  }
}
