/**
 * Asignación de cada módulo del menú lateral a su grupo y a su orden.
 *
 * Organización acordada el 2026-09-04 (USRH1788282413204, Anexo A).
 * No describe grupos: nombres, iconos y orden de los grupos viven en
 * `SYSTEM_MODULE_GROUP_CATALOG`. Esta lista solo dice qué módulo va en
 * qué grupo y en qué posición.
 *
 * Cada entrada:
 *   slug      Identidad estable (`system_module_slug`). Nunca el id numérico
 *             (R3: el id tiene colisiones conocidas; el slug no).
 *   groupKey  Clave kebab-case del catálogo, o `null` si el módulo va suelto
 *             en el primer nivel del menú (sin encabezado de grupo).
 *   order     Dentro del grupo, de 10 en 10. En sueltos, la misma escala que
 *             usan los grupos (10, 20, 30…) para convivir en el primer nivel.
 *
 * Consumidor: la migración `1788282413204000_reorganize_system_modules_into_groups`.
 * Un módulo vivo que no aparezca aquí se deja como está y se reporta en el log
 * (R5): no se le asigna `null` automático porque eso lo subiría al primer
 * nivel de todos los tenants. Los seeders (0017 y posteriores) declaran su
 * propio grupo/orden; no leen esta constante.
 *
 * IMPORTANTE — NO importar `SYSTEM_MODULE_GROUP_CATALOG` desde este archivo.
 * La migración importa esta constante; un import transitivo del catálogo vivo
 * haría que el DML histórico cambiara al editar nombres u orden de grupos
 * (§9.5 del spec). Las `groupKey` se escriben literales y deben coincidir
 * con las claves del catálogo.
 *
 * Los grupos `otros` (80) y `calendarios` (90) quedan vacíos a propósito (R10).
 */
export const ORGANIZATION_FINAL = [
    // ── Sueltos (primer nivel, sin encabezado de grupo) ─────────────────────
    { slug: 'employees-attendance-monitor',     groupKey: null,              order: 10  },
    { slug: 'employees',                        groupKey: null,              order: 20  },
    { slug: 'holidays',                         groupKey: null,              order: 30  },
    { slug: 'vacations-calendar',               groupKey: null,              order: 40  },
    { slug: 'birthdays-calendar',               groupKey: null,              order: 50  },
    { slug: 'work-anniversaries-calendar',      groupKey: null,              order: 60  },
    // ── Grupo 10 · zksync — Asistencia y jornada ────────────────────────────
    { slug: 'shift-exception-requests',         groupKey: 'zksync',          order: 10  },
    { slug: 'shifts',                           groupKey: 'zksync',          order: 20  },
    { slug: 'working-time-overrides',           groupKey: 'zksync',          order: 30  },
    { slug: 'puntos-de-acceso',                 groupKey: 'zksync',          order: 40  },
    // ── Grupo 20 · empresa ───────────────────────────────────────────────────
    { slug: 'organization-chart',               groupKey: 'empresa',         order: 10  },
    { slug: 'departments',                      groupKey: 'empresa',         order: 20  },
    { slug: 'positions',                        groupKey: 'empresa',         order: 30  },
    { slug: 'sucursales',                       groupKey: 'empresa',         order: 40  },
    { slug: 'zonas',                            groupKey: 'empresa',         order: 50  },
    { slug: 'supplies',                         groupKey: 'empresa',         order: 60  },
    { slug: 'avisos-y-noticias',                groupKey: 'empresa',         order: 70  },
    { slug: 'assessment-templates',             groupKey: 'empresa',         order: 80  },
    { slug: 'certifications',                   groupKey: 'empresa',         order: 90  },
    { slug: 'employee-lactation-periods',       groupKey: 'empresa',         order: 100 },
    { slug: 'employee-offboardings',            groupKey: 'empresa',         order: 110 },
    { slug: 'repse-registrations',              groupKey: 'empresa',         order: 120 },
    { slug: 'repse-providers',                  groupKey: 'empresa',         order: 130 },
    { slug: 'regulatory-coverage',              groupKey: 'empresa',         order: 140 },
    { slug: 'reform-simulation',                groupKey: 'empresa',         order: 150 },
    // ── Grupo 30 · reportes ──────────────────────────────────────────────────
    { slug: 'documents-expiration-matrix',      groupKey: 'reportes',        order: 10  },
    { slug: 'departments-attendance-monitor',   groupKey: 'reportes',        order: 20  },
    { slug: 'permissions-history',              groupKey: 'reportes',        order: 30  },
    // ── Grupo 40 · configuraciones ───────────────────────────────────────────
    { slug: 'system-settings',                  groupKey: 'configuraciones', order: 10  },
    { slug: 'users',                            groupKey: 'configuraciones', order: 20  },
    { slug: 'roles-and-permissions',            groupKey: 'configuraciones', order: 30  },
    { slug: 'vacations',                        groupKey: 'configuraciones', order: 40  },
    { slug: 'proceeding-file-types',            groupKey: 'configuraciones', order: 50  },
    // ── Grupo 50 · nom-035 ───────────────────────────────────────────────────
    { slug: 'compliance',                       groupKey: 'nom-035',         order: 10  },
    { slug: 'attention-program',                groupKey: 'nom-035',         order: 20  },
    { slug: 'traumatic-event-reports',          groupKey: 'nom-035',         order: 30  },
    { slug: 'traumatic-event-reports-registry', groupKey: 'nom-035',         order: 40  },
    { slug: 'complaints',                       groupKey: 'nom-035',         order: 50  },
    { slug: 'nom035-disclosure',                groupKey: 'nom-035',         order: 60  },
    { slug: 'retention-policy',                 groupKey: 'nom-035',         order: 70  },
    // ── Grupo 60 · nom-037 ───────────────────────────────────────────────────
    { slug: 'telework-workers',                 groupKey: 'nom-037',         order: 10  },
    { slug: 'telework-policy',                  groupKey: 'nom-037',         order: 20  },
    // ── Grupo 70 · plataforma ────────────────────────────────────────────────
    { slug: 'legal-documents',                  groupKey: 'plataforma',      order: 10  },
    { slug: 'consent-evidence',                 groupKey: 'plataforma',      order: 20  },
    { slug: 'sensitive-data-access-log',        groupKey: 'plataforma',      order: 30  },
    { slug: 'cuenta',        groupKey: 'plataforma',      order: 40  },
    // Los grupos otros (80) y calendarios (90) quedan vacíos a propósito.
] as const
