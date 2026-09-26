import type { PermissionGateOptions } from '#constants/permission_gate'

/**
 * Declaraciones de permiso del módulo Simulador de reforma 40 hrs
 * (`reform-simulation`). Fuente única que consume
 * `start/routes/reform_simulator_routes.ts`.
 *
 * La simulación devuelve el roster de empleados con su impacto: dato sensible
 * que antes leía cualquier usuario del tenant. El único consumidor es la
 * pantalla del módulo; el cálculo interno no pasa por la ruta.
 *
 * Bypass `standard` (root y owner): ningún código vigente trata a
 * `super-administrador` como administrador de jornada.
 */
export const REFORM_SIMULATION_PERMISSION_DECLARATIONS = {
  simulate: {
    module: 'reform-simulation',
    action: 'read',
    bypass: 'standard',
  },
} as const satisfies Record<string, PermissionGateOptions>
