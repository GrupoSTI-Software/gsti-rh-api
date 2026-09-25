/**
 * Catálogo cerrado de motivos de excepción al filtro de empresa (USRH1790275500921).
 * R2-R4 pueden agregar claves; nunca renombrar ni borrar las existentes.
 */

export const TENANT_UNSCOPED_REASON = {
  PLATFORM_ADMIN: 'platform-admin',
  AUTH_OWN_SESSION: 'auth-own-session',
  BACKFILL_MAINTENANCE: 'backfill-maintenance',
  SEEDER: 'seeder',
  TEST_FIXTURE: 'test-fixture',
  REPORT_JOB: 'report-job',
  ASSIST_SYNC_SCHEDULED: 'assist-sync-scheduled',
  NOTICE_SEND_SCHEDULED: 'notice-send-scheduled',
  ATTENDANCE_FAULT_HR: 'attendance-fault-hr',
  REPSE_FOLIO_EXPIRING: 'repse-folio-expiring',
  LACTATION_EXPIRING: 'lactation-expiring',
  EMPLOYEE_CELEBRATION: 'employee-celebration',
  WORK_JOURNAL_SEAL: 'work-journal-seal',
  ADMS_COMMAND_SWEEP: 'adms-command-sweep',
  ADMS_CALENDAR_RECALC: 'adms-calendar-recalc',
  ADMS_RETENTION: 'adms-retention',
  ADMS_DEVICE_CHANNEL: 'adms-device-channel',
  ADMS_PHOTO_TOKEN: 'adms-photo-token',
  BIOMETRIC_VAULT_REPLICATION: 'biometric-vault-replication',
  PLATFORM_DEVICES: 'platform-devices',
  PLATFORM_QUARANTINE_CLAIM: 'platform-quarantine-claim',
  PLATFORM_BILLING_PROFILE: 'platform-billing-profile',
  ASSIST_SYNC_ON_DEMAND: 'assist-sync-on-demand',
  BIOMETRIC_CONSENT_GATE: 'biometric-consent-gate',
  ACCESS_POINT_MODEL_CATALOG: 'access-point-model-catalog',
  ACCESS_POINT_OWN_COMMAND: 'access-point-own-command',
  OFFBOARDING_AUTHORIZED_SNAPSHOT: 'offboarding-authorized-snapshot',
  PERSON_IDENTITY_UNIQUENESS: 'person-identity-uniqueness',
  EMPLOYEE_STRUCTURE: 'employee-structure',
  EMPLOYEE_MASS_PURGE: 'employee-mass-purge',
} as const

export type TenantUnscopedReasonKey = keyof typeof TENANT_UNSCOPED_REASON
export type TenantUnscopedReason = (typeof TENANT_UNSCOPED_REASON)[TenantUnscopedReasonKey]

export const TENANT_UNSCOPED_ORIGIN = ['CRON', 'CONSOLE', 'PLATFORM_HTTP', 'TENANT_HTTP'] as const
export type TenantUnscopedOrigin = (typeof TENANT_UNSCOPED_ORIGIN)[number]
export type TenantUnscopedLogLevel = 'debug' | 'info' | 'warn'

export interface TenantUnscopedReasonPolicy {
  origin: TenantUnscopedOrigin
  logLevel: TenantUnscopedLogLevel
  /** Descripción en español para auditoría; nunca se escribe en el log. */
  description: string
}

export const TENANT_UNSCOPED_REASON_POLICY: Record<TenantUnscopedReason, TenantUnscopedReasonPolicy> = {
  'platform-admin': {
    origin: 'PLATFORM_HTTP',
    logLevel: 'debug',
    description: 'Consola de la plataforma: todo el grupo /api/platform',
  },
  'auth-own-session': {
    origin: 'TENANT_HTTP',
    logLevel: 'debug',
    description: 'Carga de la sesión propia del usuario ya autenticado (R2)',
  },
  'backfill-maintenance': {
    origin: 'CONSOLE',
    logLevel: 'info',
    description: 'Comandos de corrección de datos entre empresas (R2)',
  },
  'seeder': {
    origin: 'CONSOLE',
    logLevel: 'info',
    description: 'Carga inicial de datos (R2)',
  },
  'test-fixture': {
    origin: 'CONSOLE',
    logLevel: 'debug',
    description: 'Preparación y verificación de datos en pruebas (R3)',
  },
  'report-job': {
    origin: 'CRON',
    logLevel: 'info',
    description: 'Generación de reportes fuera de la request (R4)',
  },
  'assist-sync-scheduled': {
    origin: 'CRON',
    logLevel: 'debug',
    description: 'Sincronización programada de checadas, todas las empresas',
  },
  'notice-send-scheduled': {
    origin: 'CRON',
    logLevel: 'debug',
    description: 'Envío de avisos programados, cada minuto',
  },
  'attendance-fault-hr': {
    origin: 'CRON',
    logLevel: 'info',
    description: 'Aviso de faltas a RH por configuración activa',
  },
  'repse-folio-expiring': {
    origin: 'CRON',
    logLevel: 'info',
    description: 'Aviso de vigencia del folio REPSE',
  },
  'lactation-expiring': {
    origin: 'CRON',
    logLevel: 'info',
    description: 'Aviso de vencimientos de lactancia',
  },
  'employee-celebration': {
    origin: 'CRON',
    logLevel: 'info',
    description: 'Correos de cumpleaños y aniversario',
  },
  'work-journal-seal': {
    origin: 'CRON',
    logLevel: 'info',
    description: 'Cierre de jornada por empresa',
  },
  'adms-command-sweep': {
    origin: 'CRON',
    logLevel: 'debug',
    description: 'Barrido de comandos de checador, cada minuto',
  },
  'adms-calendar-recalc': {
    origin: 'CRON',
    logLevel: 'debug',
    description: 'Recálculo de calendarios de asistencia, cada minuto',
  },
  'adms-retention': {
    origin: 'CRON',
    logLevel: 'info',
    description: 'Purga por retención del canal ADMS',
  },
  'adms-device-channel': {
    origin: 'PLATFORM_HTTP',
    logLevel: 'debug',
    description: 'Canal ADMS sin sesión: perfil y serie desconocida',
  },
  'adms-photo-token': {
    origin: 'PLATFORM_HTTP',
    logLevel: 'debug',
    description: 'Descarga de foto por token opaco',
  },
  'biometric-vault-replication': {
    origin: 'PLATFORM_HTTP',
    logLevel: 'info',
    description: 'Bóveda biométrica: lectura por id para replicación',
  },
  'platform-devices': {
    origin: 'PLATFORM_HTTP',
    logLevel: 'debug',
    description: 'Equipos, puntos de acceso y discrepancias en la consola',
  },
  'platform-quarantine-claim': {
    origin: 'PLATFORM_HTTP',
    logLevel: 'debug',
    description: 'Reclamo de equipos en cuarentena',
  },
  'platform-billing-profile': {
    origin: 'PLATFORM_HTTP',
    logLevel: 'debug',
    description: 'Perfil fiscal de empresas desde la consola',
  },
  'assist-sync-on-demand': {
    origin: 'TENANT_HTTP',
    logLevel: 'warn',
    description: 'Sincronización de checadas disparada por un usuario de empresa',
  },
  'biometric-consent-gate': {
    origin: 'TENANT_HTTP',
    logLevel: 'info',
    description: 'Documento legal y consentimiento biométrico de la persona',
  },
  'access-point-model-catalog': {
    origin: 'TENANT_HTTP',
    logLevel: 'info',
    description: 'Catálogo de modelos de checador, de plataforma',
  },
  'access-point-own-command': {
    origin: 'TENANT_HTTP',
    logLevel: 'info',
    description: 'Relectura del comando propio en sincronización manual',
  },
  'offboarding-authorized-snapshot': {
    origin: 'TENANT_HTTP',
    logLevel: 'info',
    description: 'Expediente de salida ya autorizado por su empresa guardada',
  },
  'person-identity-uniqueness': {
    origin: 'TENANT_HTTP',
    logLevel: 'info',
    description: 'Unicidad global del correo personal',
  },
  'employee-structure': {
    origin: 'TENANT_HTTP',
    logLevel: 'info',
    description: 'Validación de estructura por la empresa del empleado',
  },
  'employee-mass-purge': {
    origin: 'CONSOLE',
    logLevel: 'info',
    description: 'Purga masiva de empleados',
  },
}

const REASON_VALUES: ReadonlySet<string> = new Set(Object.values(TENANT_UNSCOPED_REASON))

export function isTenantUnscopedReason(value: string): value is TenantUnscopedReason {
  return REASON_VALUES.has(value)
}
