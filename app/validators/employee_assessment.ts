import vine from '@vinejs/vine'

/**
 * Validador para registrar una evaluación de empleado.
 *
 * Campos del cuerpo (application/json):
 *
 * @field employeeId
 *   - Requerido
 *   - Tipo: número entero positivo
 *   - El empleado debe existir y no estar eliminado (validado en el controlador)
 *
 * @field assessmentTemplateId
 *   - Requerido
 *   - Tipo: número entero positivo
 *   - Identificador de la plantilla de evaluación aplicada
 *
 * @field employeeAssessmentDate
 *   - Requerido
 *   - Tipo: string con formato de fecha ISO (YYYY-MM-DD)
 *   - Se aplica trim automático
 *   - Mínimo: 1 carácter (formato básico; la validación de fecha futura se realiza en el controlador)
 *   - Restricción adicional (controlador): NO puede ser una fecha futura a la actual
 *   - Restricción adicional (controlador): NO puede existir otra evaluación activa con la misma
 *     combinación de employeeId + assessmentTemplateId + employeeAssessmentDate
 *
 * @field results
 *   - Opcional
 *   - Tipo: array de objetos con los resultados por dimensión
 *   - Cada objeto contiene:
 *     @subfield assessmentTemplateDimensionId
 *       - Requerido dentro del objeto
 *       - Tipo: número entero positivo
 *       - Identificador de la dimensión de la plantilla evaluada
 *     @subfield employeeAssessmentResultValue
 *       - Opcional y nullable dentro del objeto
 *       - Tipo: string, trim automático, máximo 255 caracteres
 *       - Se usa para calcular el estado del resultado comparando con el perfil del puesto:
 *           · Si el valor es numérico y está dentro del rango [min, max] del perfil → 'approved'
 *           · Si el valor es numérico y es menor al mínimo del perfil → 'insufficient'
 *           · Si el valor es numérico y supera el máximo del perfil → 'excellent'
 *           · Si no hay perfil configurado para el puesto o el valor es nulo → null
 */
export const createEmployeeAssessmentValidator = vine.compile(
  vine.object({
    employeeId: vine.number().positive(),
    assessmentTemplateId: vine.number().positive(),
    employeeAssessmentDate: vine.string().trim().minLength(1),
    results: vine
      .array(
        vine.object({
          assessmentTemplateDimensionId: vine.number().positive(),
          employeeAssessmentResultValue: vine
            .string()
            .trim()
            .maxLength(255)
            .nullable()
            .optional(),
        })
      )
      .optional(),
  })
)

/**
 * Validador para actualizar una evaluación de empleado existente.
 *
 * Parámetro de ruta:
 * @param employeeAssessmentId  Número entero positivo (validado en el controlador, no aquí)
 *
 * Campos del cuerpo (application/json):
 *
 * @field employeeAssessmentDate
 *   - Opcional
 *   - Tipo: string con formato de fecha ISO (YYYY-MM-DD)
 *   - Se aplica trim automático
 *   - Mínimo: 1 carácter si se envía
 *   - Restricción adicional (controlador): NO puede ser una fecha futura a la actual
 *   - Restricción adicional (controlador): si cambia la fecha, no puede quedar duplicada
 *     con otra evaluación activa del mismo empleado y plantilla
 *
 * @field results
 *   - Opcional
 *   - Tipo: array de objetos; si se envía, actualiza o crea resultados por dimensión
 *     (si la dimensión ya tiene resultado activo, lo actualiza; si no, lo crea)
 *   - Cada objeto contiene:
 *     @subfield assessmentTemplateDimensionId
 *       - Requerido dentro del objeto
 *       - Tipo: número entero positivo
 *     @subfield employeeAssessmentResultValue
 *       - Opcional y nullable dentro del objeto
 *       - Tipo: string, trim automático, máximo 255 caracteres
 *       - Recalcula el estado del resultado y el estado general de la evaluación
 */
export const updateEmployeeAssessmentValidator = vine.compile(
  vine.object({
    employeeAssessmentDate: vine.string().trim().minLength(1).optional(),
    results: vine
      .array(
        vine.object({
          assessmentTemplateDimensionId: vine.number().positive(),
          employeeAssessmentResultValue: vine
            .string()
            .trim()
            .maxLength(255)
            .nullable()
            .optional(),
        })
      )
      .optional(),
  })
)
