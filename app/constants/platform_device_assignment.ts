/**
 * Motivos de liberación de una entrega (USRH1787189981881 · §10 del spec).
 * Fuente única del enum: validador, servicio y migración lo leen de aquí,
 * ninguno lo repite suelto (molde `platform_tenant_error_codes.ts:5-15`).
 */
export const RELEASE_REASONS = ['devolucion_comodato', 'cambio_equipo', 'baja_cliente'] as const

export type PlatformDeviceAssignmentReleaseReason = (typeof RELEASE_REASONS)[number]
