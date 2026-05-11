import vine from '@vinejs/vine'

/**
 * Validador para crear una dimensión de plantilla de evaluación.
 *
 * Campos del cuerpo (application/json):
 *
 * @field assessmentTemplateId
 *   - Requerido
 *   - Tipo: número entero positivo
 *   - Identificador de la plantilla de evaluación a la que pertenece la dimensión
 *
 * @field assessmentTemplateDimensionName
 *   - Requerido
 *   - Tipo: string
 *   - Se aplica trim automático
 *   - Mínimo: 1 carácter
 *   - Máximo: 200 caracteres
 *
 * @field assessmentTemplateDimensionAcronym
 *   - Requerido
 *   - Tipo: string
 *   - Se aplica trim automático
 *   - Mínimo: 1 carácter
 *   - Máximo: 20 caracteres
 */
export const createAssessmentTemplateDimensionValidator = vine.compile(
  vine.object({
    assessmentTemplateId: vine.number().positive(),
    assessmentTemplateDimensionName: vine.string().trim().minLength(1).maxLength(200),
    assessmentTemplateDimensionAcronym: vine.string().trim().minLength(1).maxLength(20),
  })
)

/**
 * Validador para actualizar una dimensión de plantilla de evaluación existente.
 *
 * Parámetro de ruta:
 * @param assessmentTemplateDimensionId  Número entero positivo (validado en el controlador, no aquí)
 *
 * Campos del cuerpo (application/json):
 *
 * @field assessmentTemplateDimensionName
 *   - Requerido
 *   - Tipo: string
 *   - Se aplica trim automático
 *   - Mínimo: 1 carácter
 *   - Máximo: 200 caracteres
 *
 * @field assessmentTemplateDimensionAcronym
 *   - Requerido
 *   - Tipo: string
 *   - Se aplica trim automático
 *   - Mínimo: 1 carácter
 *   - Máximo: 20 caracteres
 */
export const updateAssessmentTemplateDimensionValidator = vine.compile(
  vine.object({
    assessmentTemplateDimensionName: vine.string().trim().minLength(1).maxLength(200),
    assessmentTemplateDimensionAcronym: vine.string().trim().minLength(1).maxLength(20),
  })
)
