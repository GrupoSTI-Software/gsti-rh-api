/**
 * Slugs de rol (comparación en minúsculas y sin espacios extremos) para notificar
 * faltas de registro de asistencia. Solo usuarios activos con empleado asociado
 * (`person_id`) y `user_email` reciben el correo (sin filtrar por unidad de negocio).
 */
export const ATTENDANCE_FAULT_HR_ROLE_SLUGS: string[] = [
  'RH Manager',
  'Recursos Humanos'
]
