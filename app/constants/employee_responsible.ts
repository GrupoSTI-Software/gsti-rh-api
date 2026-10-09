/**
 * Roles que quedan como responsables automáticos del colaborador nuevo.
 * Se evalúan con el rol efectivo en la empresa del colaborador.
 * `nominas` queda de solo lectura (`EmployeeService.setUserResponsible`).
 */
export const AUTO_RESPONSIBLE_ROLE_SLUGS = ['rh-manager', 'admin', 'nominas'] as const
