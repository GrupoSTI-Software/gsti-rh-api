import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1788282413204 — Reorganización definitiva de módulos en grupos estandarizados.
 *
 * SOLO DML: no crea tabla, no altera columna, no agrega índice ni constraint.
 * Aplica la organización acordada por Wilvardo el 2026-09-04 (Anexo A del spec).
 *
 * ─── Regla del encabezado (R5 de la HU) ───────────────────────────────────────
 * Un módulo que exista en la base y NO aparezca en ORGANIZATION_FINAL se deja
 * EXACTAMENTE como está: sin cambio de grupo ni de orden. El módulo se reporta
 * en el log con su id y slug para decisión manual de Wilvardo.
 * Nunca se le asigna NULL de forma automática: dejarlo suelto lo subiría al
 * primer nivel del menú de TODOS los tenants por un descuido, no por una decisión.
 *
 * ─── Identificación por slug (R3 de la HU) ────────────────────────────────────
 * Todos los UPDATE usan system_module_slug, nunca system_module_id.
 * El id tiene colisiones conocidas (46 reclamado por 4 slugs, 41 por 2); el slug
 * es la llave natural estable del repo (ver 0032_system_feature_seeder:8-12 y
 * 0058_sensitive_read_grants_backfill_seeder:22 para la convención documentada).
 *
 * ─── Copia literal congelada (§9.5 del spec) ──────────────────────────────────
 * Esta migración NO importa app/constants/system_module_group_catalog.ts.
 * Una migración es un hecho histórico inmutable; si el catálogo cambiara en el
 * futuro, el resultado de esta migración debe seguir siendo el mismo al levantar
 * un ambiente desde cero.
 *
 * ─── Slugs que no existen en BD (deuda declarada §13) ─────────────────────────
 * Los slugs 'complaints', 'telework-workers', 'legal-documents' y 'consent-evidence'
 * están en ORGANIZATION_FINAL pero en la BD tienen su fila reclamada por otro slug
 * (colisión de moduleId 41 y 46). El UPDATE por esos slugs afecta 0 filas: es el
 * comportamiento correcto y esperado. No se aborta por eso.
 */

// ─── Organización final (condición de entrada, Wilvardo 2026-09-04) ──────────
// Sueltos: groupKey null · orden en escala del primer nivel (misma de los grupos).
// Agrupados: groupKey = clave del catálogo · orden dentro del grupo.
const ORGANIZATION_FINAL = [
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
  // Los grupos otros (80) y calendarios (90) quedan vacíos a propósito.
] as const

// Orden y nombre visibles de cada grupo (Wilvardo 2026-09-04).
// Copia literal: no importar SYSTEM_MODULE_GROUP_CATALOG (§9.5).
// Sin este DML, un ambiente ya operando conservaría "ZKSync" y el orden viejo,
// y divergiría del ambiente nuevo que síembra 0059 desde el catálogo (CA5).
const GROUP_FINAL = [
  { key: 'zksync',          name: 'Asistencia y jornada', order: 10 },
  { key: 'empresa',         name: 'Empresa',              order: 20 },
  { key: 'reportes',        name: 'Reportes',             order: 30 },
  { key: 'configuraciones', name: 'Configuraciones',      order: 40 },
  { key: 'nom-035',         name: 'NOM-035',              order: 50 },
  { key: 'nom-037',         name: 'NOM-037',              order: 60 },
  { key: 'plataforma',      name: 'Plataforma',           order: 70 },
  { key: 'otros',           name: 'Otros',                order: 80 },
  { key: 'calendarios',     name: 'Calendarios',          order: 90 },
] as const

const PREVIOUS_GROUPS = [
  { key: 'reportes',        name: 'Reportes',        order: 10 },
  { key: 'empresa',         name: 'Empresa',         order: 20 },
  { key: 'calendarios',     name: 'Calendarios',     order: 30 },
  { key: 'configuraciones', name: 'Configuraciones', order: 40 },
  { key: 'nom-035',         name: 'NOM-035',         order: 50 },
  { key: 'otros',           name: 'Otros',           order: 60 },
  { key: 'zksync',          name: 'ZKSync',          order: 70 },
  { key: 'nom-037',         name: 'NOM-037',         order: 80 },
  { key: 'plataforma',      name: 'Plataforma',      order: 90 },
] as const

// ─── Mapa congelado del estado PREVIO (dejado por 1788282413066000) ──────────
// Fuente: volcado real de sae_pruebas, 2026-09-04.
// Sirve de base para el down(); null = módulo suelto (sin grupo en ese momento).
const PREVIOUS_STATE = [
  { slug: 'employees',                        groupKey: 'empresa',         order: 10  },
  { slug: 'departments',                      groupKey: 'empresa',         order: 20  },
  { slug: 'positions',                        groupKey: 'empresa',         order: 30  },
  { slug: 'vacations',                        groupKey: 'configuraciones', order: 40  },
  { slug: 'users',                            groupKey: 'empresa',         order: 50  },
  { slug: 'departments-attendance-monitor',   groupKey: 'reportes',        order: 60  },
  { slug: 'employees-attendance-monitor',     groupKey: 'reportes',        order: 70  },
  { slug: 'roles-and-permissions',            groupKey: 'configuraciones', order: 80  },
  { slug: 'shifts',                           groupKey: 'configuraciones', order: 120 },
  { slug: 'holidays',                         groupKey: 'calendarios',     order: 130 },
  { slug: 'system-settings',                  groupKey: 'configuraciones', order: 140 },
  { slug: 'documents-expiration-matrix',      groupKey: 'reportes',        order: 190 },
  { slug: 'proceeding-file-types',            groupKey: 'otros',           order: 210 },
  { slug: 'shift-exception-requests',         groupKey: 'otros',           order: 220 },
  { slug: 'organization-chart',               groupKey: 'empresa',         order: 250 },
  { slug: 'birthdays-calendar',               groupKey: 'calendarios',     order: 260 },
  { slug: 'vacations-calendar',               groupKey: 'calendarios',     order: 270 },
  { slug: 'work-anniversaries-calendar',      groupKey: 'calendarios',     order: 280 },
  { slug: 'supplies',                         groupKey: 'empresa',         order: 290 },
  { slug: 'zonas',                            groupKey: 'configuraciones', order: 300 },
  { slug: 'permissions-history',              groupKey: 'reportes',        order: 310 },
  { slug: 'avisos-y-noticias',                groupKey: 'empresa',         order: 320 },
  { slug: 'puntos-de-acceso',                 groupKey: 'zksync',          order: 330 },
  { slug: 'sucursales',                       groupKey: 'empresa',         order: 340 },
  { slug: 'assessment-templates',             groupKey: 'empresa',         order: 350 },
  { slug: 'certifications',                   groupKey: 'empresa',         order: 360 },
  { slug: 'employee-lactation-periods',       groupKey: 'empresa',         order: 370 },
  { slug: 'repse-registrations',              groupKey: 'empresa',         order: 380 },
  { slug: 'working-time-overrides',           groupKey: 'configuraciones', order: 390 },
  { slug: 'traumatic-event-reports',          groupKey: 'nom-035',         order: 400 },
  { slug: 'traumatic-event-reports-registry', groupKey: 'nom-035',         order: 410 },
  { slug: 'compliance',                       groupKey: 'nom-035',         order: 420 },
  { slug: 'retention-policy',                 groupKey: 'nom-035',         order: 430 },
  { slug: 'attention-program',                groupKey: 'nom-035',         order: 440 },
  { slug: 'nom035-disclosure',                groupKey: 'nom-035',         order: 450 },
  { slug: 'sensitive-data-access-log',        groupKey: 'nom-035',         order: 460 },
  { slug: 'telework-policy',                  groupKey: 'nom-037',         order: 470 },
  { slug: 'reform-simulation',                groupKey: 'configuraciones', order: 480 },
  { slug: 'repse-providers',                  groupKey: null,              order: 490 },
  { slug: 'regulatory-coverage',              groupKey: 'plataforma',      order: 500 },
  { slug: 'employee-offboardings',            groupKey: 'empresa',         order: 510 },
] as const

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      // ── Paso 1: Guarda de slugs duplicados ────────────────────────────────
      // CA3: primera operación del up(); ningún UPDATE ocurre antes de esto.
      type DupRow = { system_module_slug: string; total: number; ids: string }
      const [dupRows] = await db.rawQuery<[DupRow[]]>(`
        SELECT system_module_slug,
               COUNT(*)                                            AS total,
               GROUP_CONCAT(system_module_id ORDER BY system_module_id) AS ids
        FROM system_modules
        WHERE system_module_deleted_at IS NULL
        GROUP BY system_module_slug
        HAVING COUNT(*) > 1
        ORDER BY system_module_slug ASC
      `)

      if (dupRows.length > 0) {
        const lines = dupRows
          .map((r) => `  - "${r.system_module_slug}" ×${r.total} → ids: ${r.ids}`)
          .join('\n')
        throw new Error(
          '[USRH1788282413204] Slugs duplicados en system_modules — resolver antes de continuar:\n' +
            lines
        )
      }

      // ── Paso 2: Resolución de IDs de grupo por clave ─────────────────────
      type GroupRow = { system_module_group_key: string; system_module_group_id: number }
      const [groupRows] = await db.rawQuery<[GroupRow[]]>(`
        SELECT system_module_group_key, system_module_group_id
        FROM system_module_groups
        WHERE system_module_group_deleted_at IS NULL
      `)
      const groupIdByKey = new Map<string, number>(
        groupRows.map((g) => [g.system_module_group_key, g.system_module_group_id])
      )

      // Verificar que todas las claves del mapa existen en el catálogo vivo.
      const requiredKeys = [
        ...new Set(
          ORGANIZATION_FINAL.filter(
            (m): m is typeof m & { groupKey: string } => m.groupKey !== null
          ).map((m) => m.groupKey)
        ),
      ]
      const missingKeys = requiredKeys.filter((k) => !groupIdByKey.has(k))
      if (missingKeys.length > 0) {
        throw new Error(
          `[USRH1788282413204] Grupos no encontrados en el catálogo: ${missingKeys.sort().join(', ')}`
        )
      }

      // ── Paso 2b: nombre y orden de grupos (CA1 / CA5) ────────────────────
      // `otros` y `calendarios` se reordenan pero no se eliminan (regla 10).
      for (const group of GROUP_FINAL) {
        await db.rawQuery(
          `UPDATE system_module_groups
           SET    system_module_group_name  = ?,
                  system_module_group_order = ?
           WHERE  system_module_group_key        = ?
             AND  system_module_group_deleted_at IS NULL`,
          [group.name, group.order, group.key]
        )
      }

      // ── Paso 3: Aplicación por slug (CA1 — valores absolutos) ────────────
      // AND system_module_deleted_at IS NULL va en TODOS los WHERE (R6).
      // No se asume scope global del mixin SoftDeletes en consultas crudas.
      // Nota: db.rawQuery no acepta null en bindings (StrictValues); los módulos
      // sueltos (groupKey === null) usan una rama SQL separada con NULL literal.
      for (const entry of ORGANIZATION_FINAL) {
        if (entry.groupKey === null) {
          await db.rawQuery(
            `UPDATE system_modules
             SET    system_module_group_id = NULL,
                    system_module_order    = ?
             WHERE  system_module_slug        = ?
               AND  system_module_deleted_at IS NULL`,
            [entry.order, entry.slug]
          )
        } else {
          const groupId = groupIdByKey.get(entry.groupKey) ?? null
          await db.rawQuery(
            `UPDATE system_modules
             SET    system_module_group_id = ?,
                    system_module_order    = ?
             WHERE  system_module_slug        = ?
               AND  system_module_deleted_at IS NULL`,
            [groupId!, entry.order, entry.slug]
          )
        }
      }

      // ── Paso 4: Reporte de módulos fuera de la lista (CA4) ────────────────
      // Se dejan como están; solo se reportan.
      const slugsInList = ORGANIZATION_FINAL.map((m) => m.slug)
      const placeholders = slugsInList.map(() => '?').join(', ')
      type OutRow = { system_module_id: number; system_module_slug: string }
      const [outsideRows] = await db.rawQuery<[OutRow[]]>(
        `SELECT system_module_id, system_module_slug
         FROM   system_modules
         WHERE  system_module_deleted_at IS NULL
           AND  system_module_slug NOT IN (${placeholders})`,
        slugsInList
      )
      if (outsideRows.length > 0) {
        console.warn(
          '[USRH1788282413204] Módulos vivos fuera de la lista — se dejan como están (regla 5):'
        )
        for (const m of outsideRows) {
          console.warn(`  system_module_id=${m.system_module_id}  slug="${m.system_module_slug}"`)
        }
      }
    })
  }

  async down() {
    /**
     * Restaura el reparto exacto que dejó la migración 1788282413066000,
     * usando el mapa PREVIOUS_STATE congelado literalmente (volcado 2026-09-04).
     * Ver §9.5 del spec para la justificación de la copia literal.
     */
    this.defer(async (db) => {
      type GroupRow = { system_module_group_key: string; system_module_group_id: number }
      // down() consulta sin filtro de deleted_at en el catálogo: si el grupo fue
      // dado de baja, el ID sigue existiendo y se puede restaurar la FK.
      const [groupRows] = await db.rawQuery<[GroupRow[]]>(`
        SELECT system_module_group_key, system_module_group_id
        FROM system_module_groups
      `)
      const groupIdByKey = new Map<string, number>(
        groupRows.map((g) => [g.system_module_group_key, g.system_module_group_id])
      )

      for (const group of PREVIOUS_GROUPS) {
        await db.rawQuery(
          `UPDATE system_module_groups
           SET    system_module_group_name  = ?,
                  system_module_group_order = ?
           WHERE  system_module_group_key = ?`,
          [group.name, group.order, group.key]
        )
      }

      for (const entry of PREVIOUS_STATE) {
        if (entry.groupKey === null) {
          await db.rawQuery(
            `UPDATE system_modules
             SET    system_module_group_id = NULL,
                    system_module_order    = ?
             WHERE  system_module_slug        = ?
               AND  system_module_deleted_at IS NULL`,
            [entry.order, entry.slug]
          )
        } else {
          const groupId = groupIdByKey.get(entry.groupKey) ?? null
          await db.rawQuery(
            `UPDATE system_modules
             SET    system_module_group_id = ?,
                    system_module_order    = ?
             WHERE  system_module_slug        = ?
               AND  system_module_deleted_at IS NULL`,
            [groupId!, entry.order, entry.slug]
          )
        }
      }
    })
  }
}
