import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemModule from '#models/system_module'
import SystemFeature from '#models/system_feature'

/**
 * Semilla idempotente del catálogo de funcionalidades de negocio de Valanserh.
 *
 * Cada funcionalidad se asocia a su módulo por el SLUG estable del módulo
 * (system_module_slug), no por id numérico: los ids cambian entre entornos
 * (genérico, aviación, demo) y acoplar el seeder a ellos lo vuelve frágil.
 * Esta es la misma convención de resolución por llave natural que documenta
 * 0033_regulation_clause_feature_baseline_seeder.
 *
 * Cobertura: solo los módulos del catálogo base (0017_system_module_seeder).
 * Los módulos legacy de aviación (Pilots, Aircraft*, Reservations, etc.) no
 * forman parte del catálogo genérico y por eso no se siembran aquí; cuando un
 * tenant de aviación lo requiera, sembrará sus módulos y features por separado.
 *
 * Todas las funcionalidades se registran con status "disponible" porque ya
 * están en producción. Las funcionalidades de compliance (NOM-035, NOM-037,
 * etc.) las siembra cada épica funcional con su propio módulo y status.
 *
 * Idempotencia: upsert sobre (system_module_id, system_feature_slug).
 */
export default class extends BaseSeeder {
  async run() {
    const features: Array<{
      systemModuleSlug: string
      systemFeatureName: string
      systemFeatureSlug: string
      systemFeatureDescription: string | null
      systemFeatureStatus: 'disponible'
    }> = [
      // ──────────────────────────────────────────────────────────────────────
      // Empleados
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'employees',
        systemFeatureName: 'Alta y edición de empleado',
        systemFeatureSlug: 'employee-create-edit',
        systemFeatureDescription: 'Crear y modificar el perfil laboral de un empleado',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'employees',
        systemFeatureName: 'Baja de empleado',
        systemFeatureSlug: 'employee-offboarding',
        systemFeatureDescription: 'Registrar la baja y fecha de término de un empleado',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'employees',
        systemFeatureName: 'Expediente digital del empleado',
        systemFeatureSlug: 'employee-proceeding-file',
        systemFeatureDescription: 'Gestión de documentos del expediente laboral por empleado',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'employees',
        systemFeatureName: 'Asignación de sucursal',
        systemFeatureSlug: 'employee-branch-assignment',
        systemFeatureDescription: 'Asignar o reasignar al empleado a una unidad de negocio',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'employees',
        systemFeatureName: 'Asignación de turno',
        systemFeatureSlug: 'employee-shift-assignment',
        systemFeatureDescription: 'Asignar el turno laboral vigente al empleado',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'employees',
        systemFeatureName: 'Préstamo temporal a otra sucursal',
        systemFeatureSlug: 'employee-temporary-assignment',
        systemFeatureDescription: 'Registrar un préstamo temporal del empleado a otra sucursal',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'employees',
        systemFeatureName: 'Exportación de empleados',
        systemFeatureSlug: 'employee-export',
        systemFeatureDescription: 'Descargar el listado de empleados en formato Excel',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Departamentos
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'departments',
        systemFeatureName: 'Alta y edición de departamento',
        systemFeatureSlug: 'department-create-edit',
        systemFeatureDescription: 'Crear y modificar la información de un departamento',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'departments',
        systemFeatureName: 'Desactivar departamento',
        systemFeatureSlug: 'department-deactivate',
        systemFeatureDescription: 'Dar de baja lógica un departamento del catálogo',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Puestos
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'positions',
        systemFeatureName: 'Alta y edición de puesto',
        systemFeatureSlug: 'position-create-edit',
        systemFeatureDescription: 'Crear y modificar la descripción de un puesto de trabajo',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'positions',
        systemFeatureName: 'Ficha PDF del puesto',
        systemFeatureSlug: 'position-pdf-sheet',
        systemFeatureDescription: 'Generar el PDF de la descripción de puesto',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'positions',
        systemFeatureName: 'Exportación de puestos a Excel',
        systemFeatureSlug: 'position-export-excel',
        systemFeatureDescription: 'Descargar el catálogo de puestos en formato Excel',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'positions',
        systemFeatureName: 'Perfiles de evaluación por puesto',
        systemFeatureSlug: 'position-assessment-profiles',
        systemFeatureDescription: 'Definir rangos esperados por dimensión de evaluación para cada puesto',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'positions',
        systemFeatureName: 'Requerimientos de certificaciones por puesto',
        systemFeatureSlug: 'position-certification-requirements',
        systemFeatureDescription: 'Configurar las certificaciones obligatorias para un puesto',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Periodos Vacacionales
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'vacations',
        systemFeatureName: 'Configuración de periodos vacacionales',
        systemFeatureSlug: 'vacation-settings-manage',
        systemFeatureDescription: 'Definir días de vacaciones por antigüedad conforme a la LFT',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Usuarios
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'users',
        systemFeatureName: 'Alta y edición de usuario',
        systemFeatureSlug: 'user-create-edit',
        systemFeatureDescription: 'Crear y modificar credenciales y datos del usuario del sistema',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'users',
        systemFeatureName: 'Desactivar usuario',
        systemFeatureSlug: 'user-deactivate',
        systemFeatureDescription: 'Deshabilitar el acceso de un usuario al sistema',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'users',
        systemFeatureName: 'Asignación de acceso a unidades de negocio',
        systemFeatureSlug: 'user-business-unit-access',
        systemFeatureDescription: 'Controlar a qué sucursales tiene acceso un usuario',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Asistencia por departamento
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'departments-attendance-monitor',
        systemFeatureName: 'Monitor de asistencia por departamento',
        systemFeatureSlug: 'dept-attendance-monitor',
        systemFeatureDescription: 'Visualizar el estado de asistencia diaria agrupado por departamento',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'departments-attendance-monitor',
        systemFeatureName: 'Exportación de asistencia por departamento',
        systemFeatureSlug: 'dept-attendance-export',
        systemFeatureDescription: 'Descargar el reporte de asistencia departamental en Excel',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Asistencia por empleados
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'employees-attendance-monitor',
        systemFeatureName: 'Monitor de asistencia por empleado',
        systemFeatureSlug: 'employee-attendance-monitor',
        systemFeatureDescription: 'Visualizar el detalle de asistencia diaria por empleado',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'employees-attendance-monitor',
        systemFeatureName: 'Exportación de asistencia por empleado',
        systemFeatureSlug: 'employee-attendance-export',
        systemFeatureDescription: 'Descargar el reporte de asistencia por empleado en Excel',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'employees-attendance-monitor',
        systemFeatureName: 'Estadísticas agregadas de asistencia',
        systemFeatureSlug: 'attendance-aggregate-stats',
        systemFeatureDescription: 'Visualizar métricas de asistencia agregadas por rango de fechas',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Roles y permisos
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'roles-and-permissions',
        systemFeatureName: 'Gestión de roles',
        systemFeatureSlug: 'role-manage',
        systemFeatureDescription: 'Crear, editar y desactivar roles del sistema',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'roles-and-permissions',
        systemFeatureName: 'Asignación de permisos a roles',
        systemFeatureSlug: 'role-permission-assignment',
        systemFeatureDescription: 'Configurar qué módulos y acciones puede ejecutar cada rol',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Turnos
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'shifts',
        systemFeatureName: 'Alta y edición de turno',
        systemFeatureSlug: 'shift-create-edit',
        systemFeatureDescription: 'Crear y modificar turnos laborales con sus horarios y descansos',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'shifts',
        systemFeatureName: 'Excepciones de turno',
        systemFeatureSlug: 'shift-exceptions',
        systemFeatureDescription: 'Registrar modificaciones puntuales al turno de un empleado',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Festividades
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'holidays',
        systemFeatureName: 'Gestión de días festivos',
        systemFeatureSlug: 'holiday-manage',
        systemFeatureDescription: 'Configurar los días festivos oficiales y adicionales por sucursal',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Ajustes Generales
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'system-settings',
        systemFeatureName: 'Configuración general del sistema',
        systemFeatureSlug: 'system-settings-manage',
        systemFeatureDescription: 'Gestionar parámetros globales: tolerancias, correos, etc.',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Matriz de vencimientos
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'documents-expiration-matrix',
        systemFeatureName: 'Vista de matriz de vencimientos',
        systemFeatureSlug: 'expiration-matrix-view',
        systemFeatureDescription: 'Visualizar el estado de vencimiento de documentos por empleado',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'documents-expiration-matrix',
        systemFeatureName: 'Exportación de matriz de vencimientos',
        systemFeatureSlug: 'expiration-matrix-export',
        systemFeatureDescription: 'Descargar la matriz de vencimientos en formato Excel',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Proceeding File Type
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'proceeding-file-types',
        systemFeatureName: 'Gestión de tipos de expediente',
        systemFeatureSlug: 'proceeding-file-type-manage',
        systemFeatureDescription: 'Crear y configurar los tipos de documentos del expediente laboral',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Shift Exception Requests
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'shift-exception-requests',
        systemFeatureName: 'Solicitudes de excepción de turno',
        systemFeatureSlug: 'shift-exception-request-manage',
        systemFeatureDescription: 'Gestionar solicitudes de permisos, retardos y ausencias del empleado',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Organigrama
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'organization-chart',
        systemFeatureName: 'Visualización del organigrama',
        systemFeatureSlug: 'org-chart-view',
        systemFeatureDescription: 'Ver la estructura jerárquica de departamentos y puestos',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'organization-chart',
        systemFeatureName: 'Mover departamentos y puestos en el organigrama',
        systemFeatureSlug: 'org-chart-move',
        systemFeatureDescription: 'Reorganizar departamentos y puestos mediante drag-and-drop',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Cumpleaños
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'birthdays-calendar',
        systemFeatureName: 'Calendario de cumpleaños',
        systemFeatureSlug: 'birthday-calendar-view',
        systemFeatureDescription: 'Ver los cumpleaños del mes de los empleados activos',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Vacaciones
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'vacations-calendar',
        systemFeatureName: 'Calendario de vacaciones',
        systemFeatureSlug: 'vacation-calendar-view',
        systemFeatureDescription: 'Ver los periodos de vacaciones aprobados en el mes',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Aniversarios
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'work-anniversaries-calendar',
        systemFeatureName: 'Calendario de aniversarios laborales',
        systemFeatureSlug: 'work-anniversary-calendar-view',
        systemFeatureDescription: 'Ver los aniversarios de antigüedad laboral del mes',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Activos
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'supplies',
        systemFeatureName: 'Gestión de activos',
        systemFeatureSlug: 'supply-manage',
        systemFeatureDescription: 'Administrar el inventario de activos asignados a empleados',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'supplies',
        systemFeatureName: 'Asignación de activos a empleado',
        systemFeatureSlug: 'supply-employee-assignment',
        systemFeatureDescription: 'Registrar la entrega y devolución de activos por empleado',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Zonas
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'zonas',
        systemFeatureName: 'Gestión de zonas',
        systemFeatureSlug: 'zone-manage',
        systemFeatureDescription: 'Crear y configurar zonas geográficas asociadas a sucursales',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Historial de permisos
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'permissions-history',
        systemFeatureName: 'Historial de excepciones de turno',
        systemFeatureSlug: 'shift-exception-history',
        systemFeatureDescription: 'Consultar el historial de permisos, retardos y ausencias por empleado',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'permissions-history',
        systemFeatureName: 'Exportación del historial de permisos',
        systemFeatureSlug: 'shift-exception-history-export',
        systemFeatureDescription: 'Descargar el historial de excepciones en formato Excel',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Avisos y noticias
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'avisos-y-noticias',
        systemFeatureName: 'Publicación de avisos y noticias',
        systemFeatureSlug: 'notice-publish',
        systemFeatureDescription: 'Crear y publicar avisos internos o noticias para los empleados',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'avisos-y-noticias',
        systemFeatureName: 'Envío de notificación por correo',
        systemFeatureSlug: 'notice-email-notification',
        systemFeatureDescription: 'Enviar un correo a los empleados al publicar un aviso',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Puntos de acceso
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleSlug: 'puntos-de-acceso',
        systemFeatureName: 'Gestión de puntos de acceso ZKSync',
        systemFeatureSlug: 'access-point-manage',
        systemFeatureDescription: 'Administrar los dispositivos ZKSync conectados al sistema',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleSlug: 'puntos-de-acceso',
        systemFeatureName: 'Sincronización de asistencia ZKSync',
        systemFeatureSlug: 'access-point-sync',
        systemFeatureDescription: 'Sincronizar los registros de asistencia desde dispositivos ZKSync',
        systemFeatureStatus: 'disponible',
      },
    ]

    // 1. Resolver el id de cada módulo por su slug estable (no por id hardcodeado).
    //    Una sola consulta carga todos los módulos referenciados por el catálogo.
    const referencedSlugs = [...new Set(features.map((feature) => feature.systemModuleSlug))]
    const modules = await SystemModule.query().whereIn('system_module_slug', referencedSlugs)
    const moduleIdBySlug = new Map(modules.map((module) => [module.systemModuleSlug, module.systemModuleId]))

    // 2. Fallar explícito nombrando los módulos faltantes — nunca sembrar parcialmente.
    const missingSlugs = referencedSlugs.filter((slug) => !moduleIdBySlug.has(slug))
    if (missingSlugs.length > 0) {
      throw new Error(
        `[0032_system_feature_seeder] Módulo(s) no encontrado(s) por slug: ${missingSlugs.join(', ')}. ` +
          'Verifica que 0017_system_module_seeder haya corrido antes y contenga estos módulos.'
      )
    }

    // 3. Upsert idempotente sobre (system_module_id, system_feature_slug).
    for (const feature of features) {
      // El id existe con certeza: la validación previa garantizó que no falta ningún slug.
      const systemModuleId = moduleIdBySlug.get(feature.systemModuleSlug)!
      await SystemFeature.updateOrCreate(
        {
          systemModuleId,
          systemFeatureSlug: feature.systemFeatureSlug,
        },
        {
          systemFeatureName: feature.systemFeatureName,
          systemFeatureDescription: feature.systemFeatureDescription,
          systemFeatureStatus: feature.systemFeatureStatus,
        }
      )
    }
  }
}
