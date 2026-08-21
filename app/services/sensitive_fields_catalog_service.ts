import { LegalCategory, SensitiveField, SENSITIVE_FIELDS } from '#constants/sensitive_fields'

/**
 * Servicio de consulta del catálogo maestro de campos personales sensibles.
 *
 * Es la única puerta de acceso al catálogo — ningún otro módulo debe importar
 * `SENSITIVE_FIELDS` directamente para evitar acoplamientos directos a la constante.
 *
 * Diseño:
 *   - Sin estado: todos los métodos son de lectura pura sobre la constante en memoria.
 *   - Sin errores: el catálogo nunca lanza excepciones (lectura de constante).
 *   - Retornos `readonly`: nadie puede mutar el catálogo desde fuera.
 *
 * Fundamento legal: LFPDPPP art. 3.VI / Reglamento art. 61.I — inventario de datos
 * personales como evidencia de cumplimiento ante la autoridad.
 *
 * Consumidores previstos (HUs futuras):
 *   - CAP-08-10-02 — cifrado de columnas.
 *   - CAP-08-10-03 — logging de accesos a datos sensibles.
 */
export default class SensitiveFieldsCatalogService {
  /**
   * Devuelve el catálogo completo de campos sensibles.
   */
  all(): readonly SensitiveField[] {
    return SENSITIVE_FIELDS
  }

  /**
   * Devuelve todos los campos sensibles que pertenecen al modelo indicado.
   *
   * @param model — nombre de la clase Lucid, p.ej. `'Person'`
   */
  forModel(model: string): readonly SensitiveField[] {
    return SENSITIVE_FIELDS.filter((f) => f.model === model)
  }

  /**
   * Indica si un campo específico ya está cifrado hoy.
   *
   * @param model  — nombre de la clase Lucid, p.ej. `'EmployeeBank'`
   * @param column — propiedad camelCase del modelo, p.ej. `'employeeBankAccountClabe'`
   */
  isEncrypted(model: string, column: string): boolean {
    const field = SENSITIVE_FIELDS.find((f) => f.model === model && f.column === column)
    return field?.encrypted ?? false
  }

  /**
   * Indica si un campo está declarado en el catálogo (es decir, clasificado).
   *
   * @param model  — nombre de la clase Lucid
   * @param column — propiedad camelCase del modelo
   */
  isClassified(model: string, column: string): boolean {
    return SENSITIVE_FIELDS.some((f) => f.model === model && f.column === column)
  }

  /**
   * Devuelve todos los campos que pertenecen a la categoría legal indicada.
   *
   * @param category — categoría LFPDPPP: `'identificacion'`, `'financiero'`, etc.
   */
  byCategory(category: LegalCategory): readonly SensitiveField[] {
    return SENSITIVE_FIELDS.filter((f) => f.legalCategory === category)
  }

  /**
   * Brecha de cumplimiento: campos que deben cifrarse pero aún no lo están.
   *
   * Criterio: `treatment !== 'enmascarar'` AND `encrypted === false`.
   * Campos con tratamiento `enmascarar` se excluyen porque su mecanismo de
   * protección es el enmascaramiento en display, no el cifrado en reposo.
   *
   * El tamaño de este arreglo es el indicador de avance de la remediación LFPDPPP.
   */
  pendingEncryption(): readonly SensitiveField[] {
    return SENSITIVE_FIELDS.filter((f) => f.treatment !== 'enmascarar' && !f.encrypted)
  }

  /**
   * Devuelve los campos que deben entregarse enmascarados en la serialización
   * JSON del API (USRH1783019898097).
   *
   * Filtra por `maskedInApi === true`. El BO puede solicitar el valor completo
   * vía `GET /reveal/:token` que registra el acceso antes de revelar.
   */
  maskedFields(): readonly SensitiveField[] {
    return SENSITIVE_FIELDS.filter((f) => f.maskedInApi === true)
  }

  /**
   * Indica si un campo específico debe entregarse enmascarado al serializar.
   *
   * @param model  — nombre de la clase Lucid, p.ej. `'Person'`
   * @param column — propiedad camelCase del modelo, p.ej. `'personCurp'`
   */
  isMaskedInApi(model: string, column: string): boolean {
    return SENSITIVE_FIELDS.some((f) => f.model === model && f.column === column && f.maskedInApi === true)
  }

  /**
   * Categoría legal del par modelo/columna, o `null` si no está clasificado.
   * Fuente única: nadie más debe guardar su propia copia de la categoría.
   */
  categoryOf(model: string, column: string): LegalCategory | null {
    return SENSITIVE_FIELDS.find((f) => f.model === model && f.column === column)?.legalCategory ?? null
  }
}
