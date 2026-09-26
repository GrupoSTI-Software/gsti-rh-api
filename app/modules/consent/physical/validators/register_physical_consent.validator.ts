import vine from '@vinejs/vine'

/**
 * Valida el body de `POST /api/employees/:employeeId/consents/physical`.
 *
 * Whitelist estricta (S7): NO acepta `registeredByUserId`, `userId` ni `employeeId`
 * en el body — registrado-por SIEMPRE de `auth.user!.userId` (token), empleado
 * SIEMPRE del parámetro de ruta. El archivo NO pasa por `vine.file()`: se valida en
 * el service (extensión + MIME + tamaño) para emitir `key`/`code` estables (mismo
 * patrón que `employee_lactation_period_evidence.ts`); el controller lee
 * `request.file('file')` aparte.
 */
export const registerPhysicalConsentValidator = vine.compile(
  vine.object({
    /** Regla 1: solo consentimiento biométrico por esta vía (enum cerrado a un valor). */
    type: vine.enum(['biometric_consent']),
    /** Confirma qué versión firmó el papel; protege contra carrera con una republicación. */
    documentVersion: vine.string().trim().minLength(1).maxLength(20),
    /** Opcional, ≤ hoy. Sin él, el service usa la fecha del asiento. */
    signedAt: vine.date({ formats: ['YYYY-MM-DD', 'iso8601'] }).beforeOrEqual('today').optional(),
  })
)
