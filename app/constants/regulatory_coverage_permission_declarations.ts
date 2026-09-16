import type { PermissionGateOptions } from '#constants/permission_gate'

const coverageStandard = (action: string): PermissionGateOptions => ({
  module: 'regulatory-coverage',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso de Cobertura regulatoria. Fuente única que consumen
 * `start/routes/regulatory_coverage_routes.ts` y
 * `start/routes/regulatory_framework_routes.ts`.
 *
 * Las ocho rutas son lecturas y todas exigen `read`:
 *  - Cobertura (lista, resumen ejecutivo y detalle por norma): solo la consume
 *    la pantalla `/regulatory-coverage` del backoffice, cuyo guard ya pedía
 *    este permiso.
 *  - Norma con su árbol de numerales: la pide el detalle de cobertura. Sin gate,
 *    cerrar la cobertura no servía: el árbol seguía abierto por esta ruta.
 *  - Autoridades, numeral y features por numeral: no las consume el
 *    backoffice, la PWA ni la app; exponen el mismo contenido que la pantalla
 *    protege.
 *
 * Las rutas del marco regulatorio usan el módulo `regulatory-coverage`: no
 * existe `regulatory-framework` en el catálogo y el gate trataría ese slug como
 * exigido, negando a todos salvo root y owner. Si otra pantalla o app llega a
 * leer el marco, esa lectura se reevalúa (lo esperable es dejarla abierta).
 *
 * Orden de middleware: estas rutas no van en grupo y cada una monta su propio
 * `auth()`. El gate se encadena después; antes correría sin usuario y negaría
 * a todos, root incluido.
 */
export const REGULATORY_COVERAGE_PERMISSION_DECLARATIONS = {
  indexRegulatoryCoverage: coverageStandard('read'),
  regulatoryCoverageSummary: coverageStandard('read'),
  showRegulatoryCoverage: coverageStandard('read'),
  listRegulatoryAuthorities: coverageStandard('read'),
  showRegulatoryAuthority: coverageStandard('read'),
  showRegulation: coverageStandard('read'),
  showRegulationClause: coverageStandard('read'),
  showRegulationClauseFeatures: coverageStandard('read'),
} as const satisfies Record<string, PermissionGateOptions>
