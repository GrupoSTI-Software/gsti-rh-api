import { HttpContext } from '@adonisjs/core/http'
import AssessmentTemplateService from '#services/assessment_template_service'
import RoleService from '#services/role_service'
import type { AssessmentTemplateStatusFilter } from '../interfaces/assessment_template_filter_search_interface.js'
import {
  createAssessmentTemplateValidator,
  updateAssessmentTemplateValidator,
  toggleStatusAssessmentTemplateValidator,
  reorderAssessmentTemplateDimensionsValidator,
} from '#validators/assessment_template'

/**
 * Detecta si la falla VineJS proviene de un valor inválido en
 * `assessmentTemplateDimensionDataType` (campo plano o anidado dentro de
 * `dimensions[]`). Cuando ocurre, el controlador responde 422 con la clave
 * estable `tipo-dato-invalido` (CAP-02-08-01).
 */
function isInvalidDataTypeError(error: any): boolean {
  if (error?.code !== 'E_VALIDATION_ERROR') return false
  const messages: Array<{ field?: string; rule?: string }> = error.messages ?? []
  return messages.some(
    (m) =>
      m.rule === 'enum' &&
      typeof m.field === 'string' &&
      m.field.endsWith('assessmentTemplateDimensionDataType')
  )
}

function buildInvalidDataTypeResponse(t: (key: string, args?: Record<string, unknown>) => string) {
  return {
    type: 'error',
    title: t('assessment_template_dimension'),
    detail: t('assessment_template_dimension_data_type_invalid'),
    key: 'tipo-dato-invalido',
  }
}

export default class AssessmentTemplateController {
  /**
   * @swagger
   * /api/assessment-templates:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Templates
   *     summary: get assessment templates
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search term for assessment template name
   *         schema:
   *           type: string
   *       - name: status
   *         in: query
   *         required: false
   *         description: |
   *           Filtro por estatus de la plantilla (CAP-02-08-01).
   *           - `active`   (default): sólo activas.
   *           - `inactive`: sólo inactivas.
   *           - `all`:      todas.
   *         schema:
   *           type: string
   *           enum: [active, inactive, all]
   *           default: active
   *       - name: page
   *         in: query
   *         required: true
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async index({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const search = request.input('search')
      const rawStatus = String(request.input('status', 'active'))
      const status: AssessmentTemplateStatusFilter = (
        ['active', 'inactive', 'all'].includes(rawStatus)
          ? rawStatus
          : 'active'
      ) as AssessmentTemplateStatusFilter
      const rawPage = Number(request.input('page', 1))
      const rawLimit = Number(request.input('limit', 100))
      const page = Number.isNaN(rawPage) || rawPage <= 0 ? 1 : rawPage
      const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 100 : rawLimit
      const service = new AssessmentTemplateService()
      const assessmentTemplates = await service.index({
        search,
        status,
        page,
        limit,
      })
      response.status(200)
      return {
        type: 'success',
        title: t('assessment_templates'),
        message: t('resources_were_found_successfully'),
        data: {
          assessmentTemplates,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/assessment-templates:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Templates
   *     summary: create new assessment template
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               assessmentTemplateName:
   *                 type: string
   *                 description: Template name
   *                 required: true
   *                 default: ''
   *               assessmentTemplateDescription:
   *                 type: string
   *                 description: Template description
   *                 default: ''
   *               dimensions:
   *                 type: array
   *                 description: Template dimensions
   *                 items:
   *                   type: object
   *                   properties:
   *                     assessmentTemplateDimensionName:
   *                       type: string
   *                     assessmentTemplateDimensionAcronym:
   *                       type: string
   *                     assessmentTemplateDimensionDataType:
   *                       type: string
   *                       enum: [numeric, percent, categorical_amb]
   *                       description: Tipo de dato de la dimensión (default 'numeric')
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       '422':
   *         description: Tipo de dato inválido (key 'tipo-dato-invalido')
   *       default:
   *         description: Unexpected error
   */
  async store({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const payload = await request.validateUsing(createAssessmentTemplateValidator)
      const service = new AssessmentTemplateService()
      const newTemplate = await service.create(
        {
          assessmentTemplateName: payload.assessmentTemplateName,
          assessmentTemplateDescription: payload.assessmentTemplateDescription ?? null,
        },
        payload.dimensions
      )
      response.status(201)
      return {
        type: 'success',
        title: t('assessment_template'),
        message: t('resource_was_created_successfully'),
        data: { assessmentTemplate: newTemplate },
      }
    } catch (error) {
      if (isInvalidDataTypeError(error)) {
        response.status(422)
        return buildInvalidDataTypeResponse(t)
      }
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/assessment-templates/{assessmentTemplateId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Templates
   *     summary: update assessment template
   *     parameters:
   *       - in: path
   *         name: assessmentTemplateId
   *         schema:
   *           type: number
   *         description: Assessment template id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               assessmentTemplateName:
   *                 type: string
   *               assessmentTemplateDescription:
   *                 type: string
   *               dimensions:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     assessmentTemplateDimensionId:
   *                       type: number
   *                     assessmentTemplateDimensionName:
   *                       type: string
   *                     assessmentTemplateDimensionAcronym:
   *                       type: string
   *                     assessmentTemplateDimensionDataType:
   *                       type: string
   *                       enum: [numeric, percent, categorical_amb]
   *                       description: Tipo de dato de la dimensión
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       '422':
   *         description: Tipo de dato inválido (key 'tipo-dato-invalido')
   *       default:
   *         description: Unexpected error
   */
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const assessmentTemplateId = Number(request.param('assessmentTemplateId'))
      if (!assessmentTemplateId || Number.isNaN(assessmentTemplateId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('assessment_template') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const service = new AssessmentTemplateService()
      const currentTemplate = await service.show(assessmentTemplateId)
      if (!currentTemplate) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('assessment_template') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('assessment_template') }),
          data: { assessmentTemplateId },
        }
      }
      const payload = await request.validateUsing(updateAssessmentTemplateValidator)
      const updatedTemplate = await service.update(
        currentTemplate,
        {
          assessmentTemplateName: payload.assessmentTemplateName,
          assessmentTemplateDescription: payload.assessmentTemplateDescription ?? null,
        },
        payload.dimensions
      )
      response.status(201)
      return {
        type: 'success',
        title: t('assessment_template'),
        message: t('resource_was_updated_successfully'),
        data: { assessmentTemplate: updatedTemplate },
      }
    } catch (error) {
      if (isInvalidDataTypeError(error)) {
        response.status(422)
        return buildInvalidDataTypeResponse(t)
      }
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/assessment-templates/{assessmentTemplateId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Templates
   *     summary: delete assessment template
   *     parameters:
   *       - in: path
   *         name: assessmentTemplateId
   *         schema:
   *           type: number
   *         description: Assessment template id
   *         required: true
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async delete({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const assessmentTemplateId = Number(request.param('assessmentTemplateId'))
      if (!assessmentTemplateId || Number.isNaN(assessmentTemplateId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('assessment_template') }),
          message: t('missing_data_to_process'),
          data: { assessmentTemplateId },
        }
      }
      const service = new AssessmentTemplateService()
      const currentTemplate = await service.show(assessmentTemplateId)
      if (!currentTemplate) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('assessment_template') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('assessment_template') }),
          data: { assessmentTemplateId },
        }
      }
      const deletedTemplate = await service.delete(currentTemplate)
      response.status(201)
      return {
        type: 'success',
        title: t('assessment_template'),
        message: t('resource_was_deleted_successfully'),
        data: { assessmentTemplate: deletedTemplate },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/assessment-templates/{assessmentTemplateId}/status:
   *   patch:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Templates
   *     summary: toggle assessment template active status
   *     description: |
   *       Activa o desactiva una plantilla de evaluación sin tocar el resto
   *       de sus campos (CAP-02-08-01). El usuario debe contar con el permiso
   *       `toggle-status` sobre el módulo `assessment-templates`; en caso
   *       contrario el endpoint responde 403 con `key: 'sin-permiso'`.
   *     parameters:
   *       - in: path
   *         name: assessmentTemplateId
   *         schema:
   *           type: number
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [isActive]
   *             properties:
   *               isActive:
   *                 type: boolean
   *     responses:
   *       '200':
   *         description: Estatus actualizado
   *       '403':
   *         description: Sin permiso para conmutar estatus (key 'sin-permiso')
   *       '404':
   *         description: Plantilla no encontrada
   *       default:
   *         description: Unexpected error
   */
  async toggleStatus({ auth, request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const assessmentTemplateId = Number(request.param('assessmentTemplateId'))
      if (!assessmentTemplateId || Number.isNaN(assessmentTemplateId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('assessment_template') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }

      await auth.check()
      const user = auth.user
      if (!user) {
        response.status(401)
        return {
          type: 'error',
          title: t('assessment_template'),
          detail: t('user_unauthorized'),
        }
      }
      await user.preload('role')

      // Los roles 'root' del tenant no requieren permiso explícito;
      // cualquier otro rol debe tener `toggle-status` sobre el módulo.
      const isRoot = user.role?.roleSlug === 'root'
      if (!isRoot) {
        const roleService = new RoleService()
        const allowed = await roleService.hasAccess(
          user.roleId,
          'assessment-templates',
          'toggle-status'
        )
        if (!allowed) {
          response.status(403)
          return {
            type: 'error',
            title: t('assessment_template'),
            detail: t('assessment_template_no_permission_to_toggle_status'),
            key: 'sin-permiso',
          }
        }
      }

      const service = new AssessmentTemplateService()
      const currentTemplate = await service.show(assessmentTemplateId)
      if (!currentTemplate) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('assessment_template') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('assessment_template'),
          }),
          data: { assessmentTemplateId },
        }
      }

      const payload = await request.validateUsing(toggleStatusAssessmentTemplateValidator)
      const updatedTemplate = await service.toggleStatus(currentTemplate, payload.isActive)

      response.status(200)
      return {
        type: 'success',
        title: t('assessment_template'),
        message: t('resource_was_updated_successfully'),
        data: {
          assessmentTemplate: {
            assessmentTemplateId: updatedTemplate.assessmentTemplateId,
            assessmentTemplateIsActive: updatedTemplate.assessmentTemplateIsActive,
          },
        },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/assessment-templates/{assessmentTemplateId}/dimensions/reorder:
   *   patch:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Templates
   *     summary: reorder assessment template dimensions (bulk, atomic)
   *     description: |
   *       Reordena las dimensiones de la plantilla de forma atómica.
   *       El payload es un array `dimensions` con tuplas
   *       `{ dimensionId, orderIndex }`. El servicio valida que todos los
   *       `dimensionId` pertenezcan a la plantilla y que los `orderIndex`
   *       no estén duplicados.
   *     parameters:
   *       - in: path
   *         name: assessmentTemplateId
   *         schema:
   *           type: number
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [dimensions]
   *             properties:
   *               dimensions:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   type: object
   *                   required: [dimensionId, orderIndex]
   *                   properties:
   *                     dimensionId:
   *                       type: number
   *                     orderIndex:
   *                       type: number
   *     responses:
   *       '200':
   *         description: Reordenamiento aplicado
   *       '404':
   *         description: Plantilla no encontrada
   *       '422':
   *         description: |
   *           Reglas de negocio:
   *             - `key: 'dimension-fuera-de-template'` cuando un
   *               `dimensionId` no pertenece a la plantilla.
   *             - `key: 'indices-duplicados'` cuando hay `orderIndex`
   *               repetidos en el payload.
   *       default:
   *         description: Unexpected error
   */
  async reorderDimensions({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const assessmentTemplateId = Number(request.param('assessmentTemplateId'))
      if (!assessmentTemplateId || Number.isNaN(assessmentTemplateId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('assessment_template') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }

      const service = new AssessmentTemplateService()
      const currentTemplate = await service.show(assessmentTemplateId)
      if (!currentTemplate) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('assessment_template') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('assessment_template'),
          }),
          data: { assessmentTemplateId },
        }
      }

      const payload = await request.validateUsing(
        reorderAssessmentTemplateDimensionsValidator
      )
      const result = await service.reorderDimensions(
        assessmentTemplateId,
        payload.dimensions
      )

      if (!result.ok) {
        response.status(422)
        if (result.key === 'dimension-fuera-de-template') {
          return {
            type: 'error',
            title: t('assessment_template_dimension'),
            detail: t('assessment_template_dimension_reorder_out_of_template'),
            key: 'dimension-fuera-de-template',
            data: { offendingDimensionIds: result.offendingDimensionIds },
          }
        }
        return {
          type: 'error',
          title: t('assessment_template_dimension'),
          detail: t('assessment_template_dimension_reorder_duplicated_indexes'),
          key: 'indices-duplicados',
          data: { duplicatedIndexes: result.duplicatedIndexes },
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: t('assessment_template_dimension'),
        message: t('resource_was_updated_successfully'),
        data: {
          assessmentTemplateId,
          dimensions: result.dimensions,
        },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/assessment-templates/{assessmentTemplateId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Templates
   *     summary: get assessment template by id
   *     parameters:
   *       - in: path
   *         name: assessmentTemplateId
   *         schema:
   *           type: number
   *         description: Assessment template id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async show({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const assessmentTemplateId = Number(request.param('assessmentTemplateId'))
      if (!assessmentTemplateId || Number.isNaN(assessmentTemplateId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('assessment_template') }),
          message: t('missing_data_to_process'),
          data: { assessmentTemplateId },
        }
      }
      const service = new AssessmentTemplateService()
      const assessmentTemplate = await service.show(assessmentTemplateId)
      if (!assessmentTemplate) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('assessment_template') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('assessment_template') }),
          data: { assessmentTemplateId },
        }
      }
      response.status(200)
      return {
        type: 'success',
        title: t('assessment_template'),
        message: t('resource_was_found_successfully'),
        data: { assessmentTemplate },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }
}
