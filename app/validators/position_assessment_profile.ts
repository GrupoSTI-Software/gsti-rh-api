import vine from '@vinejs/vine'
import { ASSESSMENT_CATEGORICAL_VALUES } from '#models/position_assessment_profile'

/**
 * Enum de valores admitidos para la columna `expected_value` cuando la
 * dimensión es de tipo `categorical_amb` (Alto/Medio/Bajo).
 */
export const positionAssessmentProfileExpectedValueEnum = vine.enum(
  ASSESSMENT_CATEGORICAL_VALUES as unknown as string[]
)

/**
 * Validador para crear un perfil de evaluación de puesto.
 *
 * NOTA: La coherencia entre `min/max` y `expectedValue` con el tipo de dato
 * de la dimensión se valida a nivel de controlador (CAP-02-08-04), donde se
 * tiene acceso a `assessmentTemplateDimensionDataType`. Aquí sólo se aplican
 * las restricciones de tipo y rango sintáctico de cada campo.
 */
export const createPositionAssessmentProfileValidator = vine.compile(
  vine.object({
    positionId: vine.number().positive(),
    assessmentTemplateDimensionId: vine.number().positive(),
    positionAssessmentProfileMinimumValue: vine.number().min(0).nullable().optional(),
    positionAssessmentProfileMaximumValue: vine.number().min(0).nullable().optional(),
    positionAssessmentProfileExpectedValue: positionAssessmentProfileExpectedValueEnum
      .nullable()
      .optional(),
  })
)

/**
 * Validador para actualizar un perfil de evaluación existente.
 * Sólo se permite cambiar los rangos / valor esperado; el puesto y la
 * dimensión asociados son inmutables a través de este endpoint.
 */
export const updatePositionAssessmentProfileValidator = vine.compile(
  vine.object({
    positionAssessmentProfileMinimumValue: vine.number().min(0).nullable().optional(),
    positionAssessmentProfileMaximumValue: vine.number().min(0).nullable().optional(),
    positionAssessmentProfileExpectedValue: positionAssessmentProfileExpectedValueEnum
      .nullable()
      .optional(),
  })
)
