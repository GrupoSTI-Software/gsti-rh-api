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
