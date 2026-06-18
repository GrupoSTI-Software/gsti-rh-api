import vine from '@vinejs/vine'
import { assessmentTemplateDimensionDataTypeEnum } from './assessment_template_dimension.js'

/**
 * Validador para crear una plantilla de evaluación.
 *
 * Campos del cuerpo (application/json):
 *
 * @field assessmentTemplateName
 *   - Requerido
 *   - Tipo: string
 *   - Se aplica trim automático
 *   - Mínimo: 1 carácter
 *   - Máximo: 200 caracteres
 *
 * @field assessmentTemplateDescription
 *   - Opcional
 *   - Tipo: string
 *   - Se aplica trim automático
 *   - Máximo: 2000 caracteres
 *
 * @field dimensions
 *   - Opcional
 *   - Tipo: array de objetos
 *   - Cada objeto contiene:
 *     @subfield assessmentTemplateDimensionName
 *       - Requerido dentro del objeto
 *       - Tipo: string, trim automático, mínimo 1, máximo 200 caracteres
 *     @subfield assessmentTemplateDimensionAcronym
 *       - Requerido dentro del objeto
 *       - Tipo: string, trim automático, mínimo 1, máximo 20 caracteres
 *     @subfield assessmentTemplateDimensionDataType
 *       - Opcional dentro del objeto (default 'numeric')
 *       - Enum: 'numeric' | 'percent' | 'categorical_amb'
 */
export const createAssessmentTemplateValidator = vine.compile(
  vine.object({
    assessmentTemplateName: vine.string().trim().minLength(1).maxLength(200),
    assessmentTemplateDescription: vine.string().trim().maxLength(2000).optional(),
    dimensions: vine
      .array(
        vine.object({
          assessmentTemplateDimensionName: vine.string().trim().minLength(1).maxLength(200),
          assessmentTemplateDimensionAcronym: vine.string().trim().minLength(1).maxLength(20),
          assessmentTemplateDimensionDataType: assessmentTemplateDimensionDataTypeEnum.optional(),
        })
      )
      .optional(),
  })
)

/**
 * Validador para actualizar una plantilla de evaluación existente.
 *
 * Parámetro de ruta:
 * @param assessmentTemplateId  Número entero positivo (validado en el controlador, no aquí)
 *
 * Campos del cuerpo (application/json):
 *
 * @field assessmentTemplateName
 *   - Requerido
 *   - Tipo: string
 *   - Se aplica trim automático
 *   - Mínimo: 1 carácter
 *   - Máximo: 200 caracteres
 *
 * @field assessmentTemplateDescription
 *   - Opcional
 *   - Tipo: string
 *   - Se aplica trim automático
 *   - Máximo: 2000 caracteres
 *
 * @field dimensions
 *   - Opcional
 *   - Tipo: array de objetos
 *   - Si se envía, se sincroniza el array completo:
 *     las dimensiones ausentes reciben soft delete,
 *     las presentes con ID se actualizan,
 *     las presentes sin ID se crean.
 *   - Cada objeto contiene:
 *     @subfield assessmentTemplateDimensionId
 *       - Opcional dentro del objeto
 *       - Tipo: número entero positivo
 *       - Indica que la dimensión ya existe y debe actualizarse
 *     @subfield assessmentTemplateDimensionName
 *       - Requerido dentro del objeto
 *       - Tipo: string, trim automático, mínimo 1, máximo 200 caracteres
 *     @subfield assessmentTemplateDimensionAcronym
 *       - Requerido dentro del objeto
 *       - Tipo: string, trim automático, mínimo 1, máximo 20 caracteres
 *     @subfield assessmentTemplateDimensionDataType
 *       - Opcional dentro del objeto
 *       - Enum: 'numeric' | 'percent' | 'categorical_amb'
 */
export const updateAssessmentTemplateValidator = vine.compile(
  vine.object({
    assessmentTemplateName: vine.string().trim().minLength(1).maxLength(200),
    assessmentTemplateDescription: vine.string().trim().maxLength(2000).optional(),
    dimensions: vine
      .array(
        vine.object({
          assessmentTemplateDimensionId: vine.number().positive().optional(),
          assessmentTemplateDimensionName: vine.string().trim().minLength(1).maxLength(200),
          assessmentTemplateDimensionAcronym: vine.string().trim().minLength(1).maxLength(20),
          assessmentTemplateDimensionDataType: assessmentTemplateDimensionDataTypeEnum.optional(),
        })
      )
      .optional(),
  })
)

/**
 * Validador para el endpoint PATCH /assessment-templates/:id/status.
 *
 * Sólo acepta `isActive` (boolean). El controlador valida adicionalmente
 * que el rol del usuario tenga el permiso `toggle-status` sobre el módulo
 * `assessment-templates`; en caso contrario responde 403 con
 * `key: 'sin-permiso'` (CAP-02-08-01).
 *
 * @field isActive
 *   - Requerido
 *   - Tipo: boolean
 */
export const toggleStatusAssessmentTemplateValidator = vine.compile(
  vine.object({
    isActive: vine.boolean(),
  })
)

/**
 * Validador para el endpoint PATCH /assessment-templates/:id/dimensions/reorder.
 *
 * Acepta un array no vacío `dimensions` con tuplas { dimensionId, orderIndex }.
 * El controlador y/o servicio validan reglas de negocio adicionales:
 *  - Todos los `dimensionId` deben pertenecer a la plantilla del path
 *    (de lo contrario, 422 `key: 'dimension-fuera-de-template'`).
 *  - Los `orderIndex` deben ser únicos dentro del payload
 *    (de lo contrario, 422 `key: 'indices-duplicados'`).
 *
 * @field dimensions[].dimensionId  número entero positivo, requerido.
 * @field dimensions[].orderIndex   número entero ≥ 0, requerido.
 */
export const reorderAssessmentTemplateDimensionsValidator = vine.compile(
  vine.object({
    dimensions: vine
      .array(
        vine.object({
          dimensionId: vine.number().positive(),
          orderIndex: vine.number().min(0),
        })
      )
      .minLength(1),
  })
)
