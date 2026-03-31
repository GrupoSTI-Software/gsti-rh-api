/**
 * Catálogo de modalidades y tipos de baja laboral (empleados).
 */

export const EMPLOYEE_TERMINATION_MODALITIES = [
  'Renuncia',
  'Retiro',
  'Baja Administrativa',
  'Despido',
  'Rescisión',
  'Mutuo Acuerdo',
  'Transferencia',
] as const

export type EmployeeTerminationModality = (typeof EMPLOYEE_TERMINATION_MODALITIES)[number]

export interface EmployeeTerminationTypeDefinition {
  tipo: string
  descripcion: string
  categoria: string
  aplica_para: string
}

export const EMPLOYEE_TERMINATION_TYPES: EmployeeTerminationTypeDefinition[] = [
  {
    tipo: 'Jubilación',
    descripcion:
      'Conclusión de la vida laboral activa por cumplimiento de edad o años de servicio reglamentarios.',
    categoria: 'Inevitable',
    aplica_para: 'Renuncia / Retiro',
  },
  {
    tipo: 'Fallecimiento o Incapacidad Permanente',
    descripcion:
      'Cese de la relación laboral derivado de situaciones de fuerza mayor o condiciones de salud limitantes.',
    categoria: 'Inevitable',
    aplica_para: 'Baja Administrativa',
  },
  {
    tipo: 'Cambio de Residencia',
    descripcion:
      'Relocalización geográfica del colaborador a una zona fuera del alcance operativo de la organización.',
    categoria: 'Inevitable',
    aplica_para: 'Renuncia',
  },
  {
    tipo: 'Causas Familiares de Fuerza Mayor',
    descripcion:
      'Atención a responsabilidades o cuidados familiares críticos que impiden la continuidad en la jornada laboral.',
    categoria: 'Inevitable',
    aplica_para: 'Renuncia',
  },
  {
    tipo: 'Retorno a Formación Académica',
    descripcion: 'Decisión del colaborador de priorizar su desarrollo educativo de tiempo completo.',
    categoria: 'Inevitable',
    aplica_para: 'Renuncia',
  },
  {
    tipo: 'Bajo Desempeño Operativo',
    descripcion:
      'Finalización de la relación tras no alcanzar los estándares de productividad establecidos después de un plan de mejora.',
    categoria: 'Aceptable',
    aplica_para: 'Despido / Rescisión',
  },
  {
    tipo: 'Falta de Alineación Cultural',
    descripcion:
      'Dificultad de adaptación a los valores, dinámicas de equipo o ritmo de trabajo institucional.',
    categoria: 'Aceptable',
    aplica_para: 'Despido / Mutuo Acuerdo',
  },
  {
    tipo: 'Promoción Interna (Ascenso)',
    descripcion:
      'Transición del colaborador a una posición de mayor jerarquía o responsabilidad en otra área de la empresa.',
    categoria: 'Aceptable',
    aplica_para: 'Transferencia',
  },
  {
    tipo: 'Renovación de Competencias',
    descripcion:
      'Salida que permite la integración de nuevos perfiles con metodologías actualizadas o habilidades digitales estratégicas.',
    categoria: 'Aceptable',
    aplica_para: 'Despido / Mutuo Acuerdo',
  },
  {
    tipo: 'Fuga de Talento Clave (HiPo)',
    descripcion:
      'Pérdida inesperada de colaboradores con alto potencial o conocimientos críticos para la continuidad operativa.',
    categoria: 'Dañina',
    aplica_para: 'Renuncia',
  },
  {
    tipo: 'Desajuste de Compensación (Mercado)',
    descripcion:
      'Salida motivada por ofertas externas con beneficios económicos superiores, indicando falta de competitividad salarial.',
    categoria: 'Dañina',
    aplica_para: 'Renuncia',
  },
  {
    tipo: 'Oportunidad de Mejora en Clima Laboral',
    descripcion:
      'Baja derivada de conflictos interpersonales o falta de cohesión en el entorno de trabajo directo.',
    categoria: 'Dañina',
    aplica_para: 'Renuncia',
  },
  {
    tipo: 'Fatiga Laboral (Burnout)',
    descripcion:
      'Renuncia motivada por sobrecarga operativa derivada de periodos prolongados bajo el mínimo de plantilla.',
    categoria: 'Dañina',
    aplica_para: 'Renuncia',
  },
  {
    tipo: 'Limitación de Plan de Carrera',
    descripcion:
      'Percepción de falta de oportunidades de crecimiento o desarrollo profesional a largo plazo dentro del departamento.',
    categoria: 'Dañina',
    aplica_para: 'Renuncia',
  },
]

/** Modalidades permitidas según el texto "aplica_para" (puede listar varias separadas por "/"). */
export function modalitiesFromAplicaPara(aplicaPara: string): string[] {
  return aplicaPara
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function isValidEmployeeTerminationModality(modality: string): boolean {
  return (EMPLOYEE_TERMINATION_MODALITIES as readonly string[]).includes(modality)
}

export function isTerminationTypeCompatibleWithModality(tipo: string, modality: string): boolean {
  const def = EMPLOYEE_TERMINATION_TYPES.find((t) => t.tipo === tipo)
  if (!def) {
    return false
  }
  const allowed = modalitiesFromAplicaPara(def.aplica_para)
  return allowed.includes(modality)
}

export function getEmployeeTerminationTypeDefinition(
  tipo: string
): EmployeeTerminationTypeDefinition | undefined {
  return EMPLOYEE_TERMINATION_TYPES.find((t) => t.tipo === tipo)
}
