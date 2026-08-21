/**
 * Catálogo declarativo de campos de datos personales sensibles de Valanserh.
 *
 * Fundamentación legal:
 *   - LFPDPPP art. 3.VI — define "datos personales sensibles" (biométricos, salud, etc.)
 *   - Reglamento LFPDPPP art. 61.I — obliga a llevar un inventario clasificado de los datos
 *     personales para acreditar las medidas de seguridad proporcionales.
 *
 * Uso interno exclusivo: este catálogo describe cómo se protege cada dato sensible del
 * modelo Lucid. No debe exponerse en ningún endpoint público (LFPDPPP, "Qué cuidamos").
 *
 * Convención de actualización: cuando una HU posterior cifre una columna, el mismo PR
 * que implementa el cifrado debe voltear `encrypted` a `true` en esta fuente única.
 */

/**
 * Categoría de sensibilidad legal del dato conforme a LFPDPPP y su Reglamento.
 *
 * - `identificacion` — dato que identifica de forma única a la persona (CURP, RFC, NSS).
 * - `financiero`     — dato cuyo mal uso afecta el patrimonio (CLABE, cuenta, tarjeta, salario).
 * - `biometrico`     — dato sensible reforzado: huella, template facial, foto de reconocimiento.
 * - `salud`          — dato sensible reforzado: diagnóstico, discapacidad, lactancia, trauma.
 * - `contacto`       — correo, teléfono; menor sensibilidad pero sujeto a protección proporcional.
 */
export type LegalCategory = 'identificacion' | 'financiero' | 'biometrico' | 'salud' | 'contacto'

export const LEGAL_CATEGORIES = [
  'identificacion',
  'financiero',
  'biometrico',
  'salud',
  'contacto',
] as const satisfies readonly LegalCategory[]

/**
 * Tratamiento técnico que debe aplicarse al campo en reposo.
 *
 * - `cifrar`          — AES-256-CBC en reposo (patrón prepare/consume del modelo o service).
 *                       El campo no se usa en cláusulas WHERE de SQL.
 * - `cifrar-buscable` — AES-256-CBC + blind-index determinista (HU futura CAP-08-10-02).
 *                       Hoy se busca o valida por igualdad en SQL; el blind-index lo habilitará.
 * - `enmascarar`      — No se cifra; se muestra parcialmente en la UI (p.ej. últimos 4 dígitos).
 *                       El valor completo vive en claro en la BD — deuda a remediar.
 */
export type SensitiveTreatment = 'cifrar' | 'cifrar-buscable' | 'enmascarar'

/**
 * Descriptor de un campo de datos personales sensibles dentro del modelo Lucid.
 */
export interface SensitiveField {
  /** Nombre de la clase Lucid que contiene el campo (p.ej. `'Person'`). */
  readonly model: string
  /** Propiedad camelCase del modelo (p.ej. `'personCurp'`). */
  readonly column: string
  /** Categoría de sensibilidad ante la LFPDPPP. */
  readonly legalCategory: LegalCategory
  /** Tratamiento técnico requerido; nunca ambiguo (reglas 2 y 3 de la HU). */
  readonly treatment: SensitiveTreatment
  /**
   * Estado real de cifrado HOY — baseline de cumplimiento.
   * `true` = ya cifrado en producción. `false` = en claro, pendiente de remediar.
   * Fuente: anclas validadas contra código en rama `multitenant` al 2026-06-29.
   */
  readonly encrypted: boolean
  /**
   * Marca de elegibilidad para el endpoint de revelado (`GET /reveal/:token`).
   *
   * A partir de USRH1787204602825 el enmascaramiento en serialización ya no
   * se decide con esta bandera: lo decide el permiso de lectura de la
   * categoría legal, vía `sensitiveSerialize`. `true` solo indica que el
   * campo puede pedirse completo por el flujo de revelado con motivo.
   *
   * Ausencia (o `false`) = el campo aún no entra a ese flujo de revelado.
   * No cambiar ninguna entrada del arreglo en esta historia.
   */
  readonly maskedInApi?: true
}

/**
 * Catálogo maestro de campos personales sensibles de Valanserh (27 columnas).
 *
 * Exclusiones justificadas (no se incluyen porque no son datos sensibles de la persona):
 *   - `workDisabilityPeriodFile`           — ruta S3, no dato clínico.
 *   - `workDisabilityPeriodTicketFolio`    — folio administrativo, no PII sensible.
 *   - `employeeBiometricFaceIdPhotoUrlProxy` — URL de proxy, no dato biométrico almacenado.
 *   - Campos de nombre/apellido, fecha de nacimiento, dirección — datos personales ordinarios,
 *     no sensibles reforzados; LFPDPPP art. 3.VI reserva la protección máxima a los listados aquí.
 *
 * Fuente única: ninguna otra parte del sistema debe mantener su propia copia de esta lista.
 * Ref: Reglamento LFPDPPP art. 61.I — "inventario de datos personales".
 */
export const SENSITIVE_FIELDS: readonly SensitiveField[] = [
  // ─── Person: identificación ────────────────────────────────────────────────
  // Se buscan por igualdad en SQL (validators/person.ts, employee_controller.ts).
  // Requieren cifrado con blind-index para mantener la búsqueda tras cifrar.
  // Ancla: app/models/person.ts
  { model: 'Person', column: 'personCurp', legalCategory: 'identificacion', treatment: 'cifrar-buscable', encrypted: true, maskedInApi: true },
  { model: 'Person', column: 'personRfc', legalCategory: 'identificacion', treatment: 'cifrar-buscable', encrypted: true, maskedInApi: true },
  { model: 'Person', column: 'personImssNss', legalCategory: 'identificacion', treatment: 'cifrar-buscable', encrypted: true, maskedInApi: true },

  // ─── Person: contacto ──────────────────────────────────────────────────────
  // Ancla: app/models/person.ts
  // personEmail — validado por igualdad (unique); necesita blind-index (08-10-04-01).
  { model: 'Person', column: 'personEmail', legalCategory: 'contacto', treatment: 'cifrar-buscable', encrypted: true, maskedInApi: true },
  // personPhone — LIKE retirado en USRH1782854997782; no se restaura (no es clave de búsqueda).
  { model: 'Person', column: 'personPhone', legalCategory: 'contacto', treatment: 'cifrar', encrypted: true, maskedInApi: true },
  // personPhoneSecondary — sin búsquedas en SQL.
  { model: 'Person', column: 'personPhoneSecondary', legalCategory: 'contacto', treatment: 'cifrar', encrypted: true, maskedInApi: true },

  // ─── EmployeeBank: financiero ──────────────────────────────────────────────
  // Cifrados hoy vía employeeBankService.encrypt en employee_bank_controller.ts:165-176.
  // No se usan en WHERE de SQL. Se muestran con últimos 4 dígitos (*LastNumbers) en la UI.
  // Ancla: app/models/employee_bank.ts
  { model: 'EmployeeBank', column: 'employeeBankAccountClabe', legalCategory: 'financiero', treatment: 'cifrar', encrypted: true, maskedInApi: true },
  { model: 'EmployeeBank', column: 'employeeBankAccountNumber', legalCategory: 'financiero', treatment: 'cifrar', encrypted: true, maskedInApi: true },
  { model: 'EmployeeBank', column: 'employeeBankAccountCardNumber', legalCategory: 'financiero', treatment: 'cifrar', encrypted: true, maskedInApi: true },

  // ─── EmployeeBiometric: biométrico ────────────────────────────────────────
  // employeeBiometricData — string de estado ("Finger:1, Face"); el template crudo vive
  // en API_BIOMETRICS_HOST. Cifrar el estado procede: revela presencia de biométricos.
  // No se busca en SQL.
  // Ancla: app/models/employee_biometric.ts
  { model: 'EmployeeBiometric', column: 'employeeBiometricData', legalCategory: 'biometrico', treatment: 'cifrar', encrypted: true },

  // ─── EmployeeBiometricFaceId: biométrico ──────────────────────────────────
  // employeeBiometricFaceIdToken — token de reconocimiento facial. Se compara por igualdad
  // en memoria (employee_biometric_face_id_controller.ts), NO en cláusula SQL WHERE →
  // cifrar sin blind-index es seguro (no rompe ninguna consulta de BD).
  // employeeBiometricFaceIdPhotoUrl — URL de foto en almacenamiento; revela identidad facial.
  // Ancla: app/models/employee_biometric_face_id.ts
  { model: 'EmployeeBiometricFaceId', column: 'employeeBiometricFaceIdToken', legalCategory: 'biometrico', treatment: 'cifrar', encrypted: false },
  { model: 'EmployeeBiometricFaceId', column: 'employeeBiometricFaceIdPhotoUrl', legalCategory: 'biometrico', treatment: 'cifrar', encrypted: true },

  // ─── EmployeeMedicalCondition: salud (sensible reforzado) ─────────────────
  // No se buscan en SQL; contienen información clínica individual.
  // Ancla: app/models/employee_medical_condition.ts
  { model: 'EmployeeMedicalCondition', column: 'employeeMedicalConditionDiagnosis', legalCategory: 'salud', treatment: 'cifrar', encrypted: true, maskedInApi: true },
  { model: 'EmployeeMedicalCondition', column: 'employeeMedicalConditionNotes', legalCategory: 'salud', treatment: 'cifrar', encrypted: true, maskedInApi: true },

  // ─── WorkDisabilityNote: salud (sensible reforzado) ───────────────────────
  // Nota descriptiva de incapacidad; no se busca en SQL.
  // Ancla: app/models/work_disability_note.ts
  { model: 'WorkDisabilityNote', column: 'workDisabilityNoteDescription', legalCategory: 'salud', treatment: 'cifrar', encrypted: true },

  // ─── TraumaticEventReport: salud (sensible reforzado) ─────────────────────
  // Datos del reporte de acontecimiento traumático severo (ATS NOM-035).
  // Ancla: app/models/traumatic_event_report.ts
  { model: 'TraumaticEventReport', column: 'traumaticEventReportInvolvedPeople', legalCategory: 'salud', treatment: 'cifrar', encrypted: true },
  { model: 'TraumaticEventReport', column: 'traumaticEventReportDescription', legalCategory: 'salud', treatment: 'cifrar', encrypted: true },

  // ─── EmployeeLactationPeriod: salud (sensible reforzado) ──────────────────
  // Notas del período de lactancia; no se buscan en SQL.
  // Ancla: app/models/employee_lactation_period.ts
  { model: 'EmployeeLactationPeriod', column: 'employeeLactationPeriodNotes', legalCategory: 'salud', treatment: 'cifrar', encrypted: true },

  // ─── EmployeeEmergencyContact: contacto ───────────────────────────────────
  // Teléfono del contacto de emergencia del trabajador; no se busca en SQL.
  // Ancla: app/models/employee_emergency_contact.ts
  { model: 'EmployeeEmergencyContact', column: 'employeeEmergencyContactPhone', legalCategory: 'contacto', treatment: 'cifrar', encrypted: true },

  // ─── EmployeeSpouse: contacto ─────────────────────────────────────────────
  // Teléfono del cónyuge; no se busca en SQL.
  // Ancla: app/models/employee_spouse.ts
  { model: 'EmployeeSpouse', column: 'employeeSpousePhone', legalCategory: 'contacto', treatment: 'cifrar', encrypted: true },

  // ─── EmpresaContratante: identificación (deuda clasificada) ───────────────
  // RFC de persona moral con restricción UNIQUE en BD → se busca por igualdad.
  // Cifrar requiere blind-index; es el caso de mayor complejidad de migración.
  // Ancla: app/models/empresa_contratante.ts (columna `rfc`)
  { model: 'EmpresaContratante', column: 'rfc', legalCategory: 'identificacion', treatment: 'cifrar-buscable', encrypted: true },

  // ─── TenantBillingProfile: identificación (USRH1786737531057) ─────────────
  // RFC fiscal del tenant; cifrado AES + blind index para búsqueda interna.
  // Ancla: app/models/tenant_billing_profile.ts (columna `rfc`)
  {
    model: 'TenantBillingProfile',
    column: 'rfc',
    legalCategory: 'identificacion',
    treatment: 'cifrar-buscable',
    encrypted: true,
  },

  // ─── EmployeeSalaryHistory: financiero (YA CIFRADO — patrón de referencia) ─
  // Cifrado AES-256-CBC vía prepare/consume en el modelo Lucid.
  // Ancla: app/models/employee_salary_history.ts:56-66
  { model: 'EmployeeSalaryHistory', column: 'salaryDaily', legalCategory: 'financiero', treatment: 'cifrar', encrypted: true },

  // ─── PositionSalaryRange: financiero (YA CIFRADO) ─────────────────────────
  // Mismo patrón prepare/consume que EmployeeSalaryHistory.
  // Ancla: app/models/position_salary_range.ts
  { model: 'PositionSalaryRange', column: 'minSalaryDaily', legalCategory: 'financiero', treatment: 'cifrar', encrypted: true },
  { model: 'PositionSalaryRange', column: 'maxSalaryDaily', legalCategory: 'financiero', treatment: 'cifrar', encrypted: true },

  // ─── UserConsent: contacto (evidencia de aceptación, USRH1783101935670) ───
  // "Desde dónde se aceptó" un documento legal: refuerzo probatorio, nunca en WHERE,
  // nunca usado para buscar/filtrar/segmentar usuarios. Fallo-CERRADO al descifrar
  // (mismo patrón que EmployeeEmergencyContact): si falla, responde null, no el
  // ciphertext crudo. Ancla: app/models/user_consent.ts
  { model: 'UserConsent', column: 'userConsentIp', legalCategory: 'contacto', treatment: 'cifrar', encrypted: true },
  { model: 'UserConsent', column: 'userConsentUserAgent', legalCategory: 'contacto', treatment: 'cifrar', encrypted: true },
] as const
