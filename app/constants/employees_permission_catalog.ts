import type { ActionCatalogEntry } from '#constants/permission_catalog_types'

/**
 * Catálogo de acciones autorizables del módulo Empleados: primero el
 * piloto de enumeración de las ~28 acciones ya sembradas hoy en
 * `system_permissions` bajo `system_module_id = 1` (`0018_system_permission_seeder.ts`
 * y los seeders puntuales `0047_pii_sensitive_data_module_seeder.ts` /
 * `0051_physical_consent_permission_seeder.ts`), ahora ampliado por
 * USRH1785766406722 con el inventario completo de decisiones autorizables
 * del expediente (pestañas), listado, descargas y familias legales de
 * datos sensibles, más lo que la app/portal del colaborador consume fuera
 * del control de roles del backoffice (`exemption`).
 *
 * Las 28 legacy conservan slug y `legacyEquivalence.relation: 'exact'`
 * (regla de negocio 9: no se borra ni renombra nada ya registrado). Las
 * acciones nuevas no crean fila en `system_permissions` cuando su relación
 * documental es `exact`; con `broader`/`narrower` sí se materializan porque
 * son una decisión distinta a la ya sembrada (decisión de diseño 3 del plan).
 */
/**
 * Criterio de declaración (USRH1787433076993, regla de negocio 4). Ninguna
 * acción de este catálogo puede quedar declarada sin que al menos una
 * operación real del API la exija —vía `middleware.permissionGate` o vía
 * comprobación explícita en controlador—, salvo excepción escrita aquí por
 * nombre y con motivo. Una casilla que el servidor nunca consulta le miente
 * al cliente en la pantalla de Roles y permisos: la marca, la desmarca y no
 * pasa nada.
 *
 * Excepciones vigentes, por nombre y con motivo:
 *
 * 1. `manage-responsible-read`, `manage-assigned-read`, `manage-files`,
 *    `read-only-files`, `show-face-id`, `show-fingers` y
 *    `reveal-sensitive-data`. Sin consumidor en el API, pero sí lo tienen en
 *    el backoffice, donde condicionan pantalla. Producen efecto, no son
 *    casillas muertas.
 * 2. `sensitive-identificacion-write`, `sensitive-contacto-write`,
 *    `sensitive-financiero-write`, `sensitive-salud-write` y
 *    `sensitive-biometrico-write`. Superficie declarada por adelantado de
 *    USRH1787204602831, que es quien les añade el consumidor. Dueña: esa HU.
 * 3. Los seis `collaborator-*` de la sección F. Llevan bloque `exemption`,
 *    `SystemPermissionCatalogSyncService.ensureAction` los ignora y nunca
 *    tienen fila en `system_permissions`. Son apartados documentales, no
 *    permisos.
 *
 * Retirados por esta HU, con baja lógica en base de datos (no borrado) y por
 * tanto reversibles: `tab-consentimiento-write`, `tab-responsable-write`,
 * `tab-responsable-delete`, `tab-asignados-write` y `tab-asignados-delete`.
 * Lo que de verdad gobierna esas escrituras es `register-physical-consent` y
 * `manage-responsible-edit` ∨ `manage-assigned-edit`, que no se tocan.
 */
export type EmployeesSection =
  | 'foto'
  | 'trabajo'
  | 'persona'
  | 'condicion-medica'
  | 'periodos-lactancia'
  | 'expediente'
  | 'consentimiento'
  | 'domicilio'
  | 'bancos'
  | 'responsable'
  | 'zonas'
  | 'asignados'
  | 'biometricos'
  | 'anotaciones'
  | 'dispositivos'
  | 'evaluaciones'
  | 'assessments'
  | 'ruta-carrera'
  | 'certificaciones'
  | 'listado'
  | 'descargas'
  | 'datos-sensibles'
  | 'turnos'
  | 'app-colaborador'

/** Secciones que corresponden a una pestaña del expediente (excluye las agrupadoras). */
type TabSection = Exclude<
  EmployeesSection,
  'listado' | 'descargas' | 'datos-sensibles' | 'turnos' | 'app-colaborador'
>

/**
 * Entradas `tab-<section>-read|write` comunes a toda pestaña. No se exporta:
 * es un detalle de armado de este catálogo, no una utilidad reusable por
 * otros módulos.
 *
 * Genérica en `S` (en vez de anotar el retorno como
 * `ActionCatalogEntry<EmployeesSection>[]`) a propósito: anotar el retorno
 * ensancha cada `slug` a `string`, y como `EMPLOYEES_PERMISSION_CATALOG` se
 * arma intercalando llamadas a este helper con literales sueltos, ese
 * ensanchamiento se filtraba a `EmployeeActionSlug` completo. Al inferir `S`
 * desde el argumento y usar `as const` en cada entrada y en el arreglo que
 * devuelve, TypeScript conserva el slug literal de cada pestaña.
 */
/**
 * Entrada `tab-<section>-read`, común a toda pestaña. Extraída de
 * `tabReadWrite` (USRH1787433076993) porque tres pestañas ahora declaran solo
 * la consulta y necesitan construirla sin arrastrar la de escritura.
 *
 * Genérica en `S` y con `as const` en el objeto por la misma razón que sus
 * consumidoras: anotar el retorno ensancharía `slug` a `string` y ese
 * ensanchamiento se filtraría a `EmployeeActionSlug`.
 */
function tabReadEntry<S extends TabSection>(section: S, label: string) {
  return {
    slug: `tab-${section}-read` as const,
    displayName: `Consultar ${label}`,
    kind: 'read' as const,
    section,
    exceptionProfile: 'standard' as const,
    legacyEquivalence: { systemPermissionSlug: 'read' as const, relation: 'broader' as const },
  } as const
}

function tabReadWrite<S extends TabSection>(section: S, label: string, writeLegacySlug?: string) {
  const read = tabReadEntry(section, label)
  const write = {
    slug: `tab-${section}-write` as const,
    displayName: `Modificar ${label}`,
    kind: 'write' as const,
    section,
    exceptionProfile: 'standard' as const,
    legacyEquivalence: {
      systemPermissionSlug: writeLegacySlug ?? 'update-information',
      relation: 'broader' as const,
    },
  } as const
  return [read, write] as const
}

/**
 * Pestañas con las tres decisiones (read/write/delete — sección B del plan).
 *
 * Deliberadamente NO es una única función con `opts: { withDelete: boolean }`
 * que decida con un `if`: como `boolean` no es literal, TypeScript infiere el
 * retorno de esa función como la UNIÓN de las dos formas posibles (con y sin
 * delete) para TODAS las llamadas, sin importar el valor concreto pasado en
 * cada sitio. Al combinar ~19 llamadas así en un solo arreglo `as const`, esa
 * unión se multiplica combinatoriamente y TypeScript deja de poder
 * representarla (`TS2590 — union type too complex to represent`). Separar en
 * dos funciones sin ramas da a cada llamada un tipo de retorno fijo y evita
 * el problema.
 */
function tabActionsWithDelete<S extends TabSection>(
  section: S,
  label: string,
  writeLegacySlug?: string
) {
  const [read, write] = tabReadWrite(section, label, writeLegacySlug)
  const del = {
    slug: `tab-${section}-delete` as const,
    displayName: `Eliminar ${label}`,
    kind: 'delete' as const,
    section,
    exceptionProfile: 'standard' as const,
    legacyEquivalence: { systemPermissionSlug: 'delete' as const, relation: 'broader' as const },
  } as const
  return [read, write, del] as const
}

/**
 * Pestañas de las que solo se declara la consulta (USRH1787433076993). Su
 * escritura la gobierna un permiso distinto que el API sí exige:
 * `register-physical-consent` para consentimiento
 * (`app/modules/consent/physical/physical_consent.controller.ts:13`), y
 * `manage-responsible-edit` ∨ `manage-assigned-edit` para responsable y
 * asignados (`app/constants/employees_write_permission_declarations.ts`,
 * entradas `createUserResponsibleEmployee` / `updateUserResponsibleEmployee` /
 * `deleteUserResponsibleEmployee`). Declarar aquí un `-write` o un `-delete`
 * para ellas produce una casilla que el cliente puede marcar y desmarcar sin
 * que cambie nada.
 *
 * Sin ramas, igual que sus dos hermanas y por la misma razón (TS2590, ver el
 * docblock de `tabActionsWithDelete`).
 */
function tabActionsReadOnly<S extends TabSection>(section: S, label: string) {
  return [tabReadEntry(section, label)] as const
}

/**
 * Fuente literal (no exportada) del catálogo: se mantiene con `as const` para
 * que `EmployeeActionSlug` conserve la unión de slugs concretos en vez de
 * ensancharse a `string`. Como las entradas tienen formas distintas
 * (unas con `legacyEquivalence`, otras con `exemption`, otras con ninguna),
 * el tipo de cada elemento del tuple es su literal exacto — por eso no se
 * exporta ni se recorre directamente: acceder a `legacyEquivalence`/`exemption`
 * sobre esa unión heterogénea falla en tiempo de compilación aunque el campo
 * sea opcional en `ActionCatalogEntry` (regla estructural: si el campo no
 * existe en un miembro de la unión, TypeScript no permite leerlo). Por eso
 * `EMPLOYEES_PERMISSION_CATALOG`, lo que consume el resto del código, se
 * expone abajo con el tipo general ensanchado.
 */
const CATALOG_ENTRIES = [
  // --- A) 28 legacy: conservan slug, relation exact, reubicadas por sección ---
  {
    slug: 'create',
    displayName: 'Dar de alta colaborador',
    kind: 'write',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'create', relation: 'exact' },
  },
  {
    slug: 'update',
    displayName: 'Editar colaborador',
    kind: 'write',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'update', relation: 'exact' },
  },
  {
    slug: 'delete',
    displayName: 'Dar de baja colaborador',
    kind: 'delete',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'delete', relation: 'exact' },
  },
  {
    slug: 'read',
    displayName: 'Consultar listado de colaboradores',
    kind: 'read',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'read', relation: 'exact' },
  },
  {
    slug: 'read-terminated-employees',
    displayName: 'Ver personal dado de baja',
    kind: 'read',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'read-terminated-employees', relation: 'exact' },
  },
  {
    slug: 'update-information',
    displayName: 'Actualizar información del colaborador',
    kind: 'write',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'update-information', relation: 'exact' },
  },
  {
    slug: 'add-exception',
    displayName: 'Aplicar excepción de turno a una persona',
    kind: 'write',
    section: 'turnos',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'add-exception', relation: 'exact' },
  },
  {
    slug: 'manage-shift',
    displayName: 'Administrar turno',
    kind: 'write',
    section: 'turnos',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'manage-shift', relation: 'exact' },
  },
  {
    slug: 'manage-vacation',
    displayName: 'Administrar vacaciones',
    kind: 'write',
    section: 'turnos',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'manage-vacation', relation: 'exact' },
  },
  {
    slug: 'exception-request',
    displayName: 'Solicitar excepción de turno',
    kind: 'write',
    section: 'turnos',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'exception-request', relation: 'exact' },
  },
  {
    slug: 'manage-shift-change',
    displayName: 'Administrar cambio de turno',
    kind: 'write',
    section: 'turnos',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'manage-shift-change', relation: 'exact' },
  },
  {
    slug: 'remove-shift-assigned-to-the-day',
    displayName: 'Quitar turno asignado del día',
    kind: 'delete',
    section: 'turnos',
    exceptionProfile: 'standard',
    legacyEquivalence: {
      systemPermissionSlug: 'remove-shift-assigned-to-the-day',
      relation: 'exact',
    },
  },
  {
    slug: 'read-only-files',
    displayName: 'Consultar archivos del expediente',
    kind: 'read',
    section: 'expediente',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'read-only-files', relation: 'exact' },
  },
  {
    slug: 'manage-files',
    displayName: 'Administrar archivos del expediente',
    kind: 'write',
    section: 'expediente',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'manage-files', relation: 'exact' },
  },
  {
    slug: 'read-work-disabilities',
    displayName: 'Consultar incapacidades',
    kind: 'read',
    section: 'expediente',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'read-work-disabilities', relation: 'exact' },
  },
  {
    slug: 'manage-work-disabilities',
    displayName: 'Administrar incapacidades',
    kind: 'write',
    section: 'expediente',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'manage-work-disabilities', relation: 'exact' },
  },
  {
    slug: 'manage-responsible-read',
    displayName: 'Consultar responsable asignado',
    kind: 'read',
    section: 'responsable',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'manage-responsible-read', relation: 'exact' },
  },
  {
    slug: 'manage-responsible-edit',
    displayName: 'Administrar responsable asignado',
    kind: 'write',
    section: 'responsable',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'manage-responsible-edit', relation: 'exact' },
  },
  {
    slug: 'manage-assigned-read',
    displayName: 'Consultar colaboradores asignados',
    kind: 'read',
    section: 'asignados',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'manage-assigned-read', relation: 'exact' },
  },
  {
    slug: 'manage-assigned-edit',
    displayName: 'Administrar colaboradores asignados',
    kind: 'write',
    section: 'asignados',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'manage-assigned-edit', relation: 'exact' },
  },
  {
    slug: 'full-employee-assigned',
    displayName: 'Acceso total a colaboradores asignados',
    kind: 'write',
    section: 'asignados',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'full-employee-assigned', relation: 'exact' },
  },
  {
    slug: 'manage-biotime',
    displayName: 'Sincronizar contra equipo biométrico externo',
    kind: 'write',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'manage-biotime', relation: 'exact' },
  },
  {
    slug: 'show-face-id',
    displayName: 'Consultar Face ID',
    kind: 'read',
    section: 'biometricos',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'show-face-id', relation: 'exact' },
  },
  {
    slug: 'upload-face-id',
    displayName: 'Cargar Face ID',
    kind: 'write',
    section: 'biometricos',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'upload-face-id', relation: 'exact' },
  },
  {
    slug: 'show-fingers',
    displayName: 'Consultar huellas',
    kind: 'read',
    section: 'biometricos',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'show-fingers', relation: 'exact' },
  },
  {
    slug: 'upload-fingers',
    displayName: 'Cargar huellas',
    kind: 'write',
    section: 'biometricos',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'upload-fingers', relation: 'exact' },
  },
  {
    slug: 'reveal-sensitive-data',
    displayName: 'Revelar dato sensible completo',
    kind: 'read',
    section: 'datos-sensibles',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'reveal-sensitive-data', relation: 'exact' },
  },
  {
    slug: 'register-physical-consent',
    displayName: 'Registrar consentimiento físico',
    kind: 'write',
    section: 'consentimiento',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'register-physical-consent', relation: 'exact' },
  },

  // --- B) Pestañas del expediente (nuevas) — 16 con delete + consentimiento,
  //         responsable y asignados solo de consulta (USRH1787433076993) ---
  ...tabActionsWithDelete('foto', 'Foto'),
  ...tabActionsWithDelete('trabajo', 'Trabajo'),
  ...tabActionsWithDelete('persona', 'Persona'),
  ...tabActionsWithDelete('condicion-medica', 'Condición médica'),
  ...tabActionsWithDelete('periodos-lactancia', 'Periodos de lactancia'),
  // Excepción de la regla general (sección B del plan): la pestaña de
  // archivos del expediente documenta broader hacia `manage-files`, no
  // hacia `update-information`.
  ...tabActionsWithDelete('expediente', 'Expediente', 'manage-files'),
  ...tabActionsWithDelete('domicilio', 'Domicilio'),
  ...tabActionsWithDelete('bancos', 'Bancos'),
  ...tabActionsReadOnly('responsable', 'Responsable'),
  ...tabActionsWithDelete('zonas', 'Zonas'),
  ...tabActionsReadOnly('asignados', 'Asignados'),
  ...tabActionsWithDelete('biometricos', 'Biométricos'),
  ...tabActionsWithDelete('anotaciones', 'Anotaciones'),
  ...tabActionsWithDelete('dispositivos', 'Dispositivos'),
  ...tabActionsWithDelete('evaluaciones', 'Evaluaciones'),
  ...tabActionsWithDelete('assessments', 'Assessments'),
  ...tabActionsWithDelete('ruta-carrera', 'Ruta de carrera'),
  ...tabActionsWithDelete('certificaciones', 'Certificaciones'),
  ...tabActionsReadOnly('consentimiento', 'Consentimiento'),

  // --- Suministros del colaborador (USRH1785766406727): un permiso para todo el ciclo ---
  {
    slug: 'manage-employee-supplies',
    displayName: 'Administrar suministros del colaborador',
    kind: 'write',
    section: 'expediente',
    exceptionProfile: 'standard',
  },

  // --- C) Listado (nuevas) ---
  {
    slug: 'import-employees',
    displayName: 'Importar personal',
    kind: 'write',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'create', relation: 'broader' },
  },
  {
    slug: 'import-shift-assignments',
    displayName: 'Importar asignaciones de turno',
    kind: 'write',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'manage-shift', relation: 'broader' },
  },
  {
    slug: 'import-vacations',
    displayName: 'Importar vacaciones',
    kind: 'write',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'manage-vacation', relation: 'broader' },
  },
  {
    slug: 'apply-exception-mass',
    displayName: 'Aplicar excepción de turno a un grupo',
    kind: 'write',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'add-exception', relation: 'broader' },
  },
  {
    slug: 'generate-badges',
    displayName: 'Generar gafetes',
    kind: 'write',
    section: 'listado',
    exceptionProfile: 'standard',
  },

  // --- D) Descargas (nuevas) ---
  {
    slug: 'download-employees-list',
    displayName: 'Descargar reporte de personal',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-attendance-report',
    displayName: 'Descargar reporte de asistencia',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-vacations-history',
    displayName: 'Descargar histórico de vacaciones',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-proceeding-files',
    displayName: 'Descargar expediente documental',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-employees-import-template',
    displayName: 'Descargar plantilla de importación de personal',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-shift-assignment-template',
    displayName: 'Descargar plantilla de importación de turnos',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-shift-exceptions',
    displayName: 'Descargar excepciones de turno',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-vacations-report',
    displayName: 'Descargar reporte de vacaciones',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-vacations-summary',
    displayName: 'Descargar resumen de vacaciones',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-vacation-import-template',
    displayName: 'Descargar plantilla de importación de vacaciones',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-payroll-format',
    displayName: 'Descargar formato de nómina',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-attendance-by-employee',
    displayName: 'Descargar asistencia por colaborador',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-attendance-by-position',
    displayName: 'Descargar asistencia por puesto',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-attendance-by-department',
    displayName: 'Descargar asistencia por departamento',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-attendance-all',
    displayName: 'Descargar asistencia general',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-permissions-by-dates',
    displayName: 'Descargar reporte de permisos por fechas',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-supplies-report',
    displayName: 'Descargar reporte de suministros',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },
  {
    slug: 'download-employee-contract',
    displayName: 'Descargar contrato',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
  },

  // --- E) Datos sensibles (nuevas) ---
  {
    slug: 'sensitive-identificacion-read',
    displayName: 'Consultar datos de identificación',
    kind: 'read',
    section: 'datos-sensibles',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'reveal-sensitive-data', relation: 'broader' },
  },
  {
    slug: 'sensitive-identificacion-write',
    displayName: 'Modificar datos de identificación',
    kind: 'write',
    section: 'datos-sensibles',
    exceptionProfile: 'standard',
  },
  {
    slug: 'sensitive-contacto-read',
    displayName: 'Consultar datos de contacto',
    kind: 'read',
    section: 'datos-sensibles',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'reveal-sensitive-data', relation: 'broader' },
  },
  {
    slug: 'sensitive-contacto-write',
    displayName: 'Modificar datos de contacto',
    kind: 'write',
    section: 'datos-sensibles',
    exceptionProfile: 'standard',
  },
  {
    slug: 'sensitive-financiero-read',
    displayName: 'Consultar datos financieros',
    kind: 'read',
    section: 'datos-sensibles',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'reveal-sensitive-data', relation: 'broader' },
  },
  {
    slug: 'sensitive-financiero-write',
    displayName: 'Modificar datos financieros',
    kind: 'write',
    section: 'datos-sensibles',
    exceptionProfile: 'standard',
  },
  {
    slug: 'sensitive-salud-read',
    displayName: 'Consultar datos de salud',
    kind: 'read',
    section: 'datos-sensibles',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'reveal-sensitive-data', relation: 'broader' },
  },
  {
    slug: 'sensitive-salud-write',
    displayName: 'Modificar datos de salud',
    kind: 'write',
    section: 'datos-sensibles',
    exceptionProfile: 'standard',
  },
  {
    slug: 'sensitive-biometrico-read',
    displayName: 'Consultar datos biométricos (familia legal)',
    kind: 'read',
    section: 'datos-sensibles',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'reveal-sensitive-data', relation: 'broader' },
  },
  {
    slug: 'sensitive-biometrico-write',
    displayName: 'Modificar datos biométricos (familia legal)',
    kind: 'write',
    section: 'datos-sensibles',
    exceptionProfile: 'standard',
  },

  // --- F) Apartados app colaborador (exemption, no BD) — owner: Wilvardo ---
  {
    slug: 'collaborator-own-profile',
    displayName: 'Perfil propio en app/portal del colaborador',
    kind: 'read',
    section: 'app-colaborador',
    exceptionProfile: 'standard',
    exemption: {
      reason:
        'Perfil propio en app/portal del colaborador; fuera del control de roles del backoffice',
      owner: 'Wilvardo',
    },
  },
  {
    slug: 'collaborator-own-badge',
    displayName: 'Gafete propio del colaborador',
    kind: 'read',
    section: 'app-colaborador',
    exceptionProfile: 'standard',
    exemption: {
      reason: 'Gafete propio (GET /api/employee-badges/me)',
      owner: 'Wilvardo',
    },
  },
  {
    slug: 'collaborator-attendance-calendar',
    displayName: 'Calendario de asistencia del colaborador',
    kind: 'read',
    section: 'app-colaborador',
    exceptionProfile: 'standard',
    exemption: {
      reason: 'Calendario de asistencia del colaborador',
      owner: 'Wilvardo',
    },
  },
  {
    slug: 'collaborator-emergency-contacts',
    displayName: 'Contactos de emergencia propios',
    kind: 'read',
    section: 'app-colaborador',
    exceptionProfile: 'standard',
    exemption: {
      reason: 'Contactos de emergencia propios',
      owner: 'Wilvardo',
    },
  },
  {
    slug: 'collaborator-work-disabilities',
    displayName: 'Incapacidades propias',
    kind: 'read',
    section: 'app-colaborador',
    exceptionProfile: 'standard',
    exemption: {
      reason: 'Incapacidades propias',
      owner: 'Wilvardo',
    },
  },
  {
    slug: 'collaborator-exception-requests',
    displayName: 'Solicitudes de excepción propias',
    kind: 'read',
    section: 'app-colaborador',
    exceptionProfile: 'standard',
    exemption: {
      reason: 'Solicitudes de excepción propias',
      owner: 'Wilvardo',
    },
  },
] as const satisfies ActionCatalogEntry<EmployeesSection>[]

/** Catálogo completo de acciones de Empleados, tipado con la forma general. */
export const EMPLOYEES_PERMISSION_CATALOG: readonly ActionCatalogEntry<EmployeesSection>[] =
  CATALOG_ENTRIES

export type EmployeeActionSlug = (typeof CATALOG_ENTRIES)[number]['slug']
