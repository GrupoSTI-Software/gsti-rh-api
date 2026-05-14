import EmployeeAssessment from '#models/employee_assessment'
import EmployeeAssessmentResult from '#models/employee_assessment_result'
import AssessmentTemplate from '#models/assessment_template'
import PositionAssessmentProfile from '#models/position_assessment_profile'
import { EmployeeAssessmentFilterSearchInterface } from '../interfaces/employee_assessment_filter_search_interface.js'

/**
 * Servicio que encapsula la lógica de negocio asociada a las evaluaciones de
 * empleados (`EmployeeAssessment`) y sus resultados por dimensión
 * (`EmployeeAssessmentResult`). Incluye:
 *
 * - Listado paginado con filtros y carga de relaciones (`assessmentTemplate`,
 *   `dimensions`, `results`).
 * - Creación y actualización con cálculo automático del estado de cada
 *   resultado y del estado general de la evaluación según el perfil
 *   configurado en el puesto (`PositionAssessmentProfile`).
 * - Eliminación lógica (soft delete) en cascada de la evaluación y sus
 *   resultados activos.
 * - Utilidades para detectar duplicados (mismo empleado + plantilla + fecha)
 *   y para obtener las plantillas distintas asignadas a un puesto a través
 *   del JOIN `position_assessment_profiles → assessment_template_dimensions`.
 *
 * Estados calculados en `employeeAssessmentStatus`:
 * - `pending`: faltan resultados con valor o no hay perfiles configurados.
 * - `approved`: todos los resultados están dentro o por arriba del rango
 *   esperado del perfil (no hay `insufficient`).
 * - `failed`: al menos un resultado está por debajo del mínimo del perfil.
 *
 * Estados calculados en `employeeAssessmentResultStatus`:
 * - `null`: el valor está vacío o no es numérico, o no hay perfil configurado.
 * - `insufficient`: valor numérico menor al mínimo del perfil.
 * - `approved`: valor numérico dentro del rango [mínimo, máximo].
 * - `excellent`: valor numérico mayor al máximo del perfil.
 */
export default class EmployeeAssessmentService {
  /**
   * Devuelve un listado paginado de evaluaciones de empleados aplicando
   * filtros opcionales sobre el empleado, plantilla y estado.
   *
   * Carga las relaciones `assessmentTemplate` (con sus dimensiones activas) y
   * `results` (con su dimensión asociada), y ordena los resultados por fecha
   * de evaluación descendente.
   *
   * @param filters Filtros de búsqueda y paginación (employeeId,
   *                assessmentTemplateId, status, page, limit).
   * @returns Resultado paginado de Lucid con las evaluaciones encontradas.
   */
  async index(filters: EmployeeAssessmentFilterSearchInterface) {
    const items = await EmployeeAssessment.query()
      .whereNull('employee_assessment_deleted_at')
      .if(filters.employeeId, (query) => {
        query.where('employee_id', filters.employeeId!)
      })
      .if(filters.assessmentTemplateId, (query) => {
        query.where('assessment_template_id', filters.assessmentTemplateId!)
      })
      .if(filters.status, (query) => {
        query.where('employee_assessment_status', filters.status!)
      })
      .preload('assessmentTemplate', (templateQuery) => {
        templateQuery.preload('dimensions', (dimQuery) => {
          dimQuery.whereNull('assessment_template_dimension_deleted_at')
        })
      })
      .preload('results', (resultQuery) => {
        resultQuery
          .whereNull('employee_assessment_result_deleted_at')
          .preload('assessmentTemplateDimension')
      })
      .orderBy('employee_assessment_date', 'desc')
      .paginate(filters.page, filters.limit)

    return items
  }

  /**
   * Obtiene todas las evaluaciones activas de un empleado, ordenadas por
   * fecha descendente, precargando la plantilla con sus dimensiones y los
   * resultados con su dimensión asociada.
   *
   * @param employeeId Identificador del empleado.
   * @returns Lista de evaluaciones del empleado (puede ser vacía).
   */
  async getByEmployee(employeeId: number) {
    const items = await EmployeeAssessment.query()
      .whereNull('employee_assessment_deleted_at')
      .where('employee_id', employeeId)
      .preload('assessmentTemplate', (templateQuery) => {
        templateQuery.preload('dimensions', (dimQuery) => {
          dimQuery.whereNull('assessment_template_dimension_deleted_at')
        })
      })
      .preload('results', (resultQuery) => {
        resultQuery
          .whereNull('employee_assessment_result_deleted_at')
          .preload('assessmentTemplateDimension')
      })
      .orderBy('employee_assessment_date', 'desc')

    return items
  }

  /**
   * Obtiene las plantillas de evaluación distintas asignadas a un puesto a través
   * del JOIN: position_assessment_profiles → assessment_template_dimensions → assessment_templates.
   *
   * CAP-02-08-04 — Sólo devuelve plantillas con `is_active = true`. Las
   * plantillas inactivas no deben ofrecerse al asignar nuevas evaluaciones
   * a empleados; el histórico ya creado permanece intacto (consultado vía
   * `getByEmployee`).
   */
  async getTemplatesByPosition(positionId: number) {
    const profiles = await PositionAssessmentProfile.query()
      .whereNull('position_assessment_profile_deleted_at')
      .where('position_id', positionId)
      .preload('assessmentTemplateDimension', (dimQuery) => {
        dimQuery.whereNull('assessment_template_dimension_deleted_at')
      })

    const templateIdSet = new Set<number>()
    for (const profile of profiles) {
      if (profile.assessmentTemplateDimension) {
        templateIdSet.add(profile.assessmentTemplateDimension.assessmentTemplateId)
      }
    }

    if (templateIdSet.size === 0) return []

    const templates = await AssessmentTemplate.query()
      .whereNull('assessment_template_deleted_at')
      .where('assessment_template_is_active', true)
      .whereIn('assessment_template_id', Array.from(templateIdSet))
      .preload('dimensions', (dimQuery) => {
        dimQuery.whereNull('assessment_template_dimension_deleted_at')
      })
      .orderBy('assessment_template_name', 'asc')

    return templates
  }

  /**
   * Crea una nueva evaluación de empleado (`EmployeeAssessment`) y, si se
   * envían `results`, también persiste cada resultado con el estado calculado
   * a partir del perfil del puesto (`PositionAssessmentProfile`).
   *
   * Pasos:
   * 1. Carga los perfiles del puesto para la plantilla indicada.
   * 2. Crea la evaluación con estado inicial `pending`.
   * 3. Persiste cada resultado con su `employeeAssessmentResultStatus`
   *    calculado por `calculateDimensionStatus`.
   * 4. Recalcula el estado general (`employeeAssessmentStatus`) de la
   *    evaluación y la guarda nuevamente.
   *
   * @param data Datos básicos de la evaluación (employeeId,
   *             assessmentTemplateId, employeeAssessmentDate).
   * @param positionId Identificador del puesto del empleado, requerido para
   *                   buscar el perfil de evaluación y calcular el estado.
   * @param results Lista opcional de resultados por dimensión.
   * @returns La evaluación recién creada con sus relaciones precargadas.
   */
  async create(
    data: {
      employeeId: number
      assessmentTemplateId: number
      employeeAssessmentDate: string
    },
    positionId: number,
    results?: {
      assessmentTemplateDimensionId: number
      employeeAssessmentResultValue?: string | null
    }[]
  ) {
    const positionProfiles = await this.getPositionProfiles(positionId, data.assessmentTemplateId)

    const newAssessment = new EmployeeAssessment()
    newAssessment.employeeId = data.employeeId
    newAssessment.assessmentTemplateId = data.assessmentTemplateId
    newAssessment.employeeAssessmentDate =
      data.employeeAssessmentDate as unknown as import('luxon').DateTime
    newAssessment.employeeAssessmentStatus = 'pending'
    await newAssessment.save()

    if (results && results.length > 0) {
      for (const r of results) {
        const resultStatus = this.calculateDimensionStatus(
          r.employeeAssessmentResultValue ?? null,
          positionProfiles,
          r.assessmentTemplateDimensionId
        )
        const newResult = new EmployeeAssessmentResult()
        newResult.employeeAssessmentId = newAssessment.employeeAssessmentId
        newResult.assessmentTemplateDimensionId = r.assessmentTemplateDimensionId
        newResult.employeeAssessmentResultValue = r.employeeAssessmentResultValue ?? null
        newResult.employeeAssessmentResultStatus = resultStatus
        await newResult.save()
      }
    }

    const assessmentStatus = await this.calculateAssessmentStatus(
      newAssessment.employeeAssessmentId,
      data.assessmentTemplateId,
      positionProfiles
    )
    newAssessment.employeeAssessmentStatus = assessmentStatus
    await newAssessment.save()

    return this.show(newAssessment.employeeAssessmentId)
  }

  /**
   * Actualiza una evaluación existente:
   * - Si se envía nueva fecha, la asigna.
   * - Para cada elemento de `results`: si ya existe un resultado activo para
   *   esa dimensión, lo actualiza; en caso contrario lo crea, recalculando el
   *   estado de cada resultado contra el perfil del puesto.
   * - Recalcula el estado general de la evaluación al final.
   *
   * @param currentAssessment Instancia ya cargada de la evaluación a actualizar.
   * @param data Datos a actualizar (por ahora sólo `employeeAssessmentDate`).
   * @param positionId Identificador del puesto, necesario para recalcular
   *                   estados contra el perfil de evaluación.
   * @param results Lista opcional de resultados a sincronizar (crear/actualizar).
   * @returns La evaluación actualizada con sus relaciones precargadas.
   */
  async update(
    currentAssessment: EmployeeAssessment,
    data: {
      employeeAssessmentDate?: string
    },
    positionId: number,
    results?: {
      assessmentTemplateDimensionId: number
      employeeAssessmentResultValue?: string | null
    }[]
  ) {
    if (data.employeeAssessmentDate) {
      currentAssessment.employeeAssessmentDate =
        data.employeeAssessmentDate as unknown as import('luxon').DateTime
    }
    await currentAssessment.save()

    const positionProfiles = await this.getPositionProfiles(
      positionId,
      currentAssessment.assessmentTemplateId
    )

    if (results && results.length > 0) {
      for (const r of results) {
        const resultStatus = this.calculateDimensionStatus(
          r.employeeAssessmentResultValue ?? null,
          positionProfiles,
          r.assessmentTemplateDimensionId
        )

        const existingResult = await EmployeeAssessmentResult.query()
          .where('employee_assessment_id', currentAssessment.employeeAssessmentId)
          .where('assessment_template_dimension_id', r.assessmentTemplateDimensionId)
          .whereNull('employee_assessment_result_deleted_at')
          .first()

        if (existingResult) {
          existingResult.employeeAssessmentResultValue = r.employeeAssessmentResultValue ?? null
          existingResult.employeeAssessmentResultStatus = resultStatus
          await existingResult.save()
        } else {
          const newResult = new EmployeeAssessmentResult()
          newResult.employeeAssessmentId = currentAssessment.employeeAssessmentId
          newResult.assessmentTemplateDimensionId = r.assessmentTemplateDimensionId
          newResult.employeeAssessmentResultValue = r.employeeAssessmentResultValue ?? null
          newResult.employeeAssessmentResultStatus = resultStatus
          await newResult.save()
        }
      }
    }

    const assessmentStatus = await this.calculateAssessmentStatus(
      currentAssessment.employeeAssessmentId,
      currentAssessment.assessmentTemplateId,
      positionProfiles
    )
    currentAssessment.employeeAssessmentStatus = assessmentStatus
    await currentAssessment.save()

    return this.show(currentAssessment.employeeAssessmentId)
  }

  /**
   * Realiza un soft delete sobre la evaluación y todos sus resultados activos
   * (`employee_assessment_result_deleted_at` se establece al timestamp actual).
   *
   * @param currentAssessment Instancia de la evaluación a eliminar lógicamente.
   * @returns La misma instancia recibida (ya marcada como eliminada).
   */
  async delete(currentAssessment: EmployeeAssessment) {
    const results = await EmployeeAssessmentResult.query()
      .where('employee_assessment_id', currentAssessment.employeeAssessmentId)
      .whereNull('employee_assessment_result_deleted_at')

    for (const result of results) {
      await result.delete()
    }

    await currentAssessment.delete()
    return currentAssessment
  }

  /**
   * Obtiene una evaluación por su identificador, con todas sus relaciones
   * precargadas (plantilla con dimensiones, resultados con su dimensión y
   * empleado).
   *
   * @param assessmentId Identificador de la evaluación.
   * @returns La evaluación encontrada o `null` si no existe / fue eliminada.
   */
  async show(assessmentId: number) {
    const assessment = await EmployeeAssessment.query()
      .whereNull('employee_assessment_deleted_at')
      .where('employee_assessment_id', assessmentId)
      .preload('assessmentTemplate', (templateQuery) => {
        templateQuery.preload('dimensions', (dimQuery) => {
          dimQuery.whereNull('assessment_template_dimension_deleted_at')
        })
      })
      .preload('results', (resultQuery) => {
        resultQuery
          .whereNull('employee_assessment_result_deleted_at')
          .preload('assessmentTemplateDimension')
      })
      .preload('employee')
      .first()

    return assessment ?? null
  }

  /**
   * Verifica si ya existe una evaluación con la misma combinación de empleado, plantilla y fecha.
   */
  async existsDuplicate(
    employeeId: number,
    assessmentTemplateId: number,
    assessmentDate: string,
    excludeId?: number
  ) {
    const query = EmployeeAssessment.query()
      .whereNull('employee_assessment_deleted_at')
      .where('employee_id', employeeId)
      .where('assessment_template_id', assessmentTemplateId)
      .where('employee_assessment_date', assessmentDate)

    if (excludeId) {
      query.whereNot('employee_assessment_id', excludeId)
    }

    const existing = await query.first()
    return !!existing
  }

  /**
   * Obtiene los perfiles de evaluación del puesto para una plantilla específica.
   */
  private async getPositionProfiles(positionId: number, assessmentTemplateId: number) {
    const profiles = await PositionAssessmentProfile.query()
      .whereNull('position_assessment_profile_deleted_at')
      .where('position_id', positionId)
      .preload('assessmentTemplateDimension', (dimQuery) => {
        dimQuery
          .whereNull('assessment_template_dimension_deleted_at')
          .where('assessment_template_id', assessmentTemplateId)
      })

    return profiles.filter((p) => p.assessmentTemplateDimension !== null)
  }

  /**
   * Calcula el estado de un resultado individual comparando el valor contra
   * el perfil del puesto, **respetando el `dataType` de la dimensión**:
   *
   *  - `numeric` / `percent`: comparación numérica contra el rango [min, max]
   *    del perfil → 'insufficient' | 'approved' | 'excellent'.
   *  - `categorical_amb`: comparación exacta contra `expectedValue` del perfil
   *    → 'approved' si coincide, 'insufficient' si difiere.
   *
   * Devuelve `null` cuando el valor está vacío, no es válido para el tipo o
   * no existe perfil configurado para la dimensión.
   */
  private calculateDimensionStatus(
    value: string | null,
    positionProfiles: PositionAssessmentProfile[],
    dimensionId: number
  ): string | null {
    if (!value || value.trim() === '') return null

    const profile = positionProfiles.find(
      (p) => p.assessmentTemplateDimensionId === dimensionId
    )
    if (!profile) return null

    const dataType =
      profile.assessmentTemplateDimension?.assessmentTemplateDimensionDataType ?? 'numeric'

    if (dataType === 'categorical_amb') {
      const expected = profile.positionAssessmentProfileExpectedValue
      if (!expected) return null
      return value.trim() === expected ? 'approved' : 'insufficient'
    }

    const numericValue = Number.parseFloat(value)
    if (!Number.isFinite(numericValue)) return null

    if (
      profile.positionAssessmentProfileMinimumValue === null ||
      profile.positionAssessmentProfileMaximumValue === null
    ) {
      return null
    }

    const minVal = Number(profile.positionAssessmentProfileMinimumValue)
    const maxVal = Number(profile.positionAssessmentProfileMaximumValue)

    if (numericValue < minVal) return 'insufficient'
    if (numericValue > maxVal) return 'excellent'
    return 'approved'
  }

  /**
   * Calcula el estado general de la evaluación basado en los resultados de sus dimensiones.
   */
  private async calculateAssessmentStatus(
    assessmentId: number,
    assessmentTemplateId: number,
    positionProfiles: PositionAssessmentProfile[]
  ): Promise<string> {
    const template = await AssessmentTemplate.query()
      .where('assessment_template_id', assessmentTemplateId)
      .preload('dimensions', (dimQuery) => {
        dimQuery.whereNull('assessment_template_dimension_deleted_at')
      })
      .first()

    if (!template) return 'pending'

    const totalDimensions = template.dimensions.length
    if (totalDimensions === 0) return 'approved'

    const results = await EmployeeAssessmentResult.query()
      .where('employee_assessment_id', assessmentId)
      .whereNull('employee_assessment_result_deleted_at')

    const dimensionIdsWithProfile = new Set(
      positionProfiles.map((p) => p.assessmentTemplateDimensionId)
    )

    const resultsWithValue = results.filter(
      (r) =>
        r.employeeAssessmentResultValue && r.employeeAssessmentResultValue.trim() !== ''
    )

    if (resultsWithValue.length < totalDimensions) return 'pending'

    const hasInsufficient = results.some(
      (r) =>
        dimensionIdsWithProfile.has(r.assessmentTemplateDimensionId) &&
        r.employeeAssessmentResultStatus === 'insufficient'
    )

    if (hasInsufficient) return 'failed'

    return 'approved'
  }
}
