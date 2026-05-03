import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Competency from '#models/competency'
import CompetencyLevelDescription from '#models/competency_level_description'

type LevelKey = 'in_development' | 'capable' | 'expert'

const LEVEL_ID_BY_CODE: Record<LevelKey, number> = {
  in_development: 1,
  capable: 2,
  expert: 3,
}

interface CompetencySeed {
  competencyId: number
  competencyName: string
  competencyType: 'technical' | 'transversal'
  descriptions: Record<LevelKey, string>
}

export default class extends BaseSeeder {
  async run() {
    const competencies: CompetencySeed[] = [
      {
        competencyId: 1,
        competencyName: 'Escritura',
        competencyType: 'transversal',
        descriptions: {
          in_development:
            'Redacta textos basicos con estructura simple. Requiere revision frecuente de terceros para asegurar claridad y correccion. Maneja formatos estandar solo con apoyo.',
          capable:
            'Produce textos claros, bien estructurados y con minima necesidad de correcciones. Adapta el tono segun la audiencia y el medio. Redacta documentos profesionales de forma autonoma.',
          expert:
            'Genera textos de alto impacto persuasivo y estrategico. Define estandares de redaccion para el equipo. Domina multiples formatos y registros con fluidez impecable.',
        },
      },
      {
        competencyId: 2,
        competencyName: 'Presentacion',
        competencyType: 'transversal',
        descriptions: {
          in_development:
            'Expone ideas con estructura basica ante grupos pequenos. Depende de notas y material de apoyo. Se pone nervioso ante audiencias grandes.',
          capable:
            'Comunica ideas con claridad y seguridad ante audiencias diversas. Disena presentaciones visuales efectivas y maneja preguntas con soltura.',
          expert:
            'Domina la narrativa y el storytelling. Influye y persuade a cualquier nivel de audiencia. Adapta el mensaje en tiempo real segun la reaccion del publico.',
        },
      },
      {
        competencyId: 3,
        competencyName: 'Negociacion',
        competencyType: 'transversal',
        descriptions: {
          in_development:
            'Participa en negociaciones sencillas con supervision. Identifica intereses propios pero le cuesta leer los de la contraparte. Tiende a ceder o rigidizarse.',
          capable:
            'Conduce negociaciones de forma autonoma buscando resultados ganar-ganar. Lee la posicion de la contraparte, plantea alternativas y cierra acuerdos favorables.',
          expert:
            'Negocia en contextos de alta complejidad y presion. Disena estrategias de negociacion para el equipo. Construye relaciones de largo plazo a traves de la negociacion.',
        },
      },
      {
        competencyId: 4,
        competencyName: 'Investigacion',
        competencyType: 'transversal',
        descriptions: {
          in_development:
            'Busca informacion en fuentes basicas y conocidas. Necesita guia para definir el alcance de la investigacion y filtrar datos relevantes.',
          capable:
            'Disena busquedas estructuradas en multiples fuentes. Filtra, compara y sintetiza informacion de forma autonoma. Presenta hallazgos con criterio analitico.',
          expert:
            'Define marcos metodologicos de investigacion. Cruza fuentes primarias y secundarias con rigor. Genera insights accionables que impactan en la toma de decisiones estrategicas.',
        },
      },
      {
        competencyId: 5,
        competencyName: 'Facilitacion',
        competencyType: 'transversal',
        descriptions: {
          in_development:
            'Modera reuniones sencillas con agenda predefinida. Le cuesta redirigir discusiones dispersas o manejar conflictos en grupo.',
          capable:
            'Facilita sesiones de trabajo colaborativo manteniendo el foco y la participacion equilibrada. Usa dinamicas y herramientas para extraer resultados concretos.',
          expert:
            'Disena y facilita procesos complejos (workshops, retrospectivas, sesiones de co-creacion) con multiples stakeholders. Transforma conversaciones dificiles en resultados productivos.',
        },
      },
      {
        competencyId: 6,
        competencyName: 'Tutoria',
        competencyType: 'transversal',
        descriptions: {
          in_development:
            'Comparte conocimiento basico de forma reactiva cuando se le pregunta. Le cuesta adaptar la explicacion al nivel del aprendiz.',
          capable:
            'Acompana activamente el desarrollo de otros. Estructura planes de aprendizaje, da retroalimentacion constructiva y adapta el estilo al perfil del aprendiz.',
          expert:
            'Forma mentores dentro del equipo. Disena programas de mentoria. Su tutoria genera autonomia y crecimiento medible en las personas que acompana.',
        },
      },
      {
        competencyId: 7,
        competencyName: 'Organizacion',
        competencyType: 'transversal',
        descriptions: {
          in_development:
            'Mantiene orden basico en sus propias tareas. Usa herramientas de organizacion de forma inconsistente. Se desorganiza bajo carga alta.',
          capable:
            'Gestiona su carga de trabajo y la del equipo con metodo. Usa herramientas de gestion de forma consistente. Prioriza correctamente ante cambios de contexto.',
          expert:
            'Disena e implementa sistemas de organizacion para equipos completos. Optimiza procesos y flujos de trabajo. Mantiene orden y eficiencia bajo condiciones de alta complejidad.',
        },
      },
      {
        competencyId: 8,
        competencyName: 'Atencion al cliente',
        competencyType: 'transversal',
        descriptions: {
          in_development:
            'Atiende solicitudes basicas siguiendo guiones o procedimientos establecidos. Requiere apoyo para resolver situaciones fuera del estandar.',
          capable:
            'Resuelve necesidades del cliente de forma autonoma, con empatia y orientacion a solucion. Identifica oportunidades de mejora en la experiencia del cliente.',
          expert:
            'Disena estrategias de servicio y experiencia del cliente. Convierte situaciones criticas en oportunidades de fidelizacion. Forma al equipo en cultura de servicio.',
        },
      },
      {
        competencyId: 9,
        competencyName: 'Resolucion de conflictos',
        competencyType: 'transversal',
        descriptions: {
          in_development:
            'Identifica cuando hay conflicto pero evita la confrontacion o escala prematuramente. Participa en la resolucion con mediacion de un tercero.',
          capable:
            'Media conflictos de forma directa y constructiva. Escucha las partes, identifica el origen del problema y facilita acuerdos. Mantiene la relacion profesional intacta.',
          expert:
            'Interviene en conflictos de alta complejidad organizacional. Disena mecanismos de prevencion y resolucion de conflictos. Su presencia genera confianza para abordar temas dificiles.',
        },
      },
      {
        competencyId: 10,
        competencyName: 'Orientacion al detalle',
        competencyType: 'transversal',
        descriptions: {
          in_development:
            'Revisa su trabajo de forma basica. Deja pasar errores menores con frecuencia. Necesita listas de verificacion para mantener la precision.',
          capable:
            'Detecta y corrige errores propios y del equipo de forma consistente. Aplica criterios de calidad sin sacrificar velocidad. Documenta con precision.',
          expert:
            'Define estandares de calidad y verificacion para el equipo. Detecta patrones de error sistemicos. Su nivel de detalle previene problemas antes de que ocurran.',
        },
      },
      {
        competencyId: 11,
        competencyName: 'Comunicacion no verbal',
        competencyType: 'transversal',
        descriptions: {
          in_development:
            'Tiene consciencia basica de su lenguaje corporal. No siempre lee senales no verbales de los demas con precision.',
          capable:
            'Lee e interpreta el lenguaje corporal de su interlocutor con precision. Ajusta su propia comunicacion no verbal conscientemente para reforzar su mensaje.',
          expert:
            'Domina la lectura de dinamicas grupales a traves del lenguaje no verbal. Usa conscientemente la comunicacion no verbal como herramienta de influencia y liderazgo.',
        },
      },
      {
        competencyId: 12,
        competencyName: 'Gestion de reuniones',
        competencyType: 'transversal',
        descriptions: {
          in_development:
            'Asiste puntualmente y participa cuando se le solicita. No siempre prepara agenda o lleva minutas. Las reuniones que organiza tienden a extenderse.',
          capable:
            'Organiza y conduce reuniones con agenda clara, tiempo definido y minutas de acuerdos. Mantiene el foco y asegura que se llegue a decisiones concretas.',
          expert:
            'Disena la cadencia de reuniones de un equipo u organizacion. Elimina reuniones innecesarias. Cada reunion que dirige produce resultados tangibles y accountability claro.',
        },
      },
      {
        competencyId: 13,
        competencyName: 'Comunicacion intercultural',
        competencyType: 'transversal',
        descriptions: {
          in_development:
            'Muestra respeto por otras culturas pero le cuesta adaptar su comunicacion a contextos culturales distintos al suyo.',
          capable:
            'Se comunica de forma efectiva con personas de diferentes culturas. Adapta tono, formalidad y canales segun el contexto cultural. Evita sesgos y malentendidos.',
          expert:
            'Disena estrategias de comunicacion para equipos multiculturales. Navega diferencias culturales complejas con naturalidad. Actua como puente entre culturas dentro de la organizacion.',
        },
      },
      {
        competencyId: 14,
        competencyName: 'Gestion del tiempo y priorizacion',
        competencyType: 'transversal',
        descriptions: {
          in_development:
            'Cumple con plazos basicos pero le cuesta priorizar cuando tiene multiples tareas simultaneas. Subestima tiempos con frecuencia.',
          capable:
            'Prioriza tareas con criterio claro (urgencia/impacto). Estima tiempos con precision razonable. Mantiene productividad consistente sin supervision constante.',
          expert:
            'Disena sistemas de priorizacion para equipos. Optimiza el uso del tiempo a nivel organizacional. Protege el tiempo de deep work propio y del equipo de forma estrategica.',
        },
      },
      {
        competencyId: 15,
        competencyName: 'Desarrollo de presentaciones persuasivas',
        competencyType: 'transversal',
        descriptions: {
          in_development:
            'Arma presentaciones funcionales pero con poco impacto persuasivo. Se enfoca en la informacion mas que en la narrativa.',
          capable:
            'Construye presentaciones con narrativa clara, datos de soporte y call to action efectivo. Adapta el mensaje al perfil de la audiencia.',
          expert:
            'Crea presentaciones que generan decisiones y accion inmediata. Domina el uso de datos, storytelling y diseno visual como herramientas integradas de persuasion.',
        },
      },
      {
        competencyId: 16,
        competencyName: 'Facilitacion de la innovacion y el pensamiento creativo',
        competencyType: 'transversal',
        descriptions: {
          in_development:
            'Participa en sesiones creativas y aporta ideas cuando se le solicita. Le cuesta salir de enfoques convencionales por cuenta propia.',
          capable:
            'Propone enfoques novedosos con regularidad. Aplica tecnicas de ideacion (brainstorming, design thinking) para resolver problemas. Crea espacios seguros para la experimentacion.',
          expert:
            'Implementa programas de innovacion organizacional. Transforma la cultura del equipo hacia la experimentacion continua. Sus iniciativas generan mejoras medibles y sostenidas.',
        },
      },
      {
        competencyId: 17,
        competencyName: 'Tecnicas de venta',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Conoce el proceso basico de ventas. Realiza actividades de prospeccion y seguimiento con supervision. Le cuesta manejar objeciones de forma autonoma.',
          capable:
            'Ejecuta el ciclo de ventas completo de forma autonoma. Maneja objeciones, cierra tratos y gestiona pipeline con metodologia. Cumple metas consistentemente.',
          expert:
            'Disena estrategias comerciales y entrena equipos de venta. Negocia cuentas clave y acuerdos de alto valor. Genera modelos de venta replicables y escalables.',
        },
      },
      {
        competencyId: 18,
        competencyName: 'Analisis financiero',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Lee estados financieros basicos e identifica indicadores principales. Requiere guia para interpretar variaciones y elaborar proyecciones.',
          capable:
            'Interpreta estados financieros, construye modelos de proyeccion y elabora reportes de analisis con autonomia. Identifica riesgos y oportunidades financieras.',
          expert:
            'Disena modelos financieros complejos para toma de decisiones estrategicas. Evalua inversiones, fusiones y valoraciones. Sus analisis impactan directamente la direccion del negocio.',
        },
      },
      {
        competencyId: 19,
        competencyName: 'Gestion de eventos',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Colabora en la logistica de eventos siguiendo indicaciones. Maneja tareas operativas como reservas, invitaciones y coordinacion basica.',
          capable:
            'Planifica y ejecuta eventos de principio a fin: presupuesto, logistica, proveedores, agenda y evaluacion post-evento. Resuelve imprevistos con autonomia.',
          expert:
            'Disena experiencias y eventos estrategicos de alto impacto. Gestiona multiples eventos simultaneos. Define estandares de calidad y ROI para la funcion de eventos.',
        },
      },
      {
        competencyId: 20,
        competencyName: 'Relaciones publicas',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Apoya en la redaccion de comunicados y coordinacion con medios bajo supervision. Conoce los canales de comunicacion basicos de la organizacion.',
          capable:
            'Gestiona la relacion con medios y stakeholders externos de forma autonoma. Elabora estrategias de comunicacion y maneja crisis de reputacion basicas.',
          expert:
            'Disena la estrategia de relaciones publicas de la organizacion. Construye y protege la reputacion corporativa. Navega crisis mediaticas complejas con criterio y eficacia.',
        },
      },
      {
        competencyId: 21,
        competencyName: 'Diseno de experiencia de usuario',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Comprende conceptos basicos de UX (usabilidad, accesibilidad). Participa en pruebas de usuario y documenta hallazgos con guia.',
          capable:
            'Disena flujos de usuario, wireframes y prototipos. Conduce pruebas de usabilidad y traduce hallazgos en mejoras de producto. Aplica principios de UX en cada entregable.',
          expert:
            'Define la vision de UX a nivel de producto o plataforma. Establece design systems y guias de experiencia. Su trabajo impacta metricas clave de adopcion y satisfaccion.',
        },
      },
      {
        competencyId: 22,
        competencyName: 'Analisis de mercado',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Recopila datos de mercado de fuentes publicas y los presenta de forma descriptiva. Necesita guia para identificar tendencias o sacar conclusiones accionables.',
          capable:
            'Realiza analisis de mercado completos: segmentacion, tendencias, competencia y tamano. Traduce los datos en recomendaciones accionables.',
          expert:
            'Disena modelos de inteligencia de mercado de forma continua. Anticipa movimientos del mercado y de competidores. Sus analisis son insumo directo para la estrategia de negocio.',
        },
      },
      {
        competencyId: 23,
        competencyName: 'Redaccion de informes tecnicos',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Documenta procedimientos basicos siguiendo plantillas. La estructura y la precision tecnica requieren revision frecuente.',
          capable:
            'Redacta informes tecnicos claros, precisos y autocontenidos. Adapta el nivel de detalle al perfil del lector. Sigue estandares de documentacion del equipo.',
          expert:
            'Define estandares de documentacion tecnica para la organizacion. Produce documentos de referencia que se convierten en fuente principal de consulta.',
        },
      },
      {
        competencyId: 24,
        competencyName: 'Analisis de riesgos financieros',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Identifica riesgos financieros evidentes (liquidez, tipo de cambio). Requiere apoyo para cuantificarlos y proponer mitigaciones.',
          capable:
            'Evalua riesgos financieros de forma sistematica. Los cuantifica, los prioriza y propone planes de mitigacion con fundamento. Usa herramientas de analisis de riesgos.',
          expert:
            'Disena marcos de gestion de riesgos financieros a nivel organizacional. Modela escenarios complejos y define politicas de cobertura y contingencia.',
        },
      },
      {
        competencyId: 25,
        competencyName: 'Planificacion de eventos corporativos',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Apoya en la coordinacion logistica de eventos corporativos. Ejecuta tareas asignadas pero no gestiona el evento completo.',
          capable:
            'Planifica y ejecuta eventos corporativos completos: lanzamientos, conferencias, capacitaciones. Gestiona presupuesto, proveedores y logistica con autonomia.',
          expert:
            'Disena el portafolio de eventos corporativos alineado a la estrategia de marca y negocio. Define metricas de exito e impacto a nivel estrategico.',
        },
      },
      {
        competencyId: 26,
        competencyName: 'Resolucion de problemas logisticos',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Identifica cuellos de botella logisticos basicos. Propone soluciones operativas con supervision.',
          capable:
            'Diagnostica y resuelve problemas logisticos complejos de forma autonoma. Optimiza rutas, inventarios y flujos de distribucion. Coordina con multiples areas.',
          expert:
            'Disena e implementa sistemas logisticos completos. Anticipa problemas antes de que ocurran. Define politicas de operacion logistica a nivel organizacional.',
        },
      },
      {
        competencyId: 27,
        competencyName: 'Desarrollo de estrategias de marketing digital',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Ejecuta acciones de marketing digital basicas (publicaciones, posteos simples) siguiendo una estrategia definida por otros.',
          capable:
            'Disena y ejecuta estrategias de marketing digital multicanal: SEO, SEM, redes sociales, email marketing. Mide resultados y optimiza campanas de forma autonoma.',
          expert:
            'Define la estrategia de marketing digital a nivel organizacional. Integra canales, automatizacion y analitica avanzada. Genera crecimiento medible y sostenible.',
        },
      },
      {
        competencyId: 28,
        competencyName: 'Negociacion contractual',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Revisa contratos basicos identificando clausulas estandar. Requiere supervision legal para negociar terminos.',
          capable:
            'Negocia terminos contractuales de forma autonoma con proveedores y clientes. Identifica riesgos legales y comerciales. Cierra acuerdos equilibrados para ambas partes.',
          expert:
            'Lidera negociaciones contractuales de alta complejidad y valor. Define marcos contractuales y politicas de negociacion para la organizacion.',
        },
      },
      {
        competencyId: 29,
        competencyName: 'Evaluacion de desempeno de los empleados',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Aplica formatos de evaluacion predefinidos. Da retroalimentacion basica pero le cuesta abordar areas de mejora de forma constructiva.',
          capable:
            'Conduce evaluaciones de desempeno completas: establece objetivos, mide resultados, da retroalimentacion constructiva y disena planes de desarrollo individuales.',
          expert:
            'Disena sistemas de evaluacion de desempeno organizacionales. Calibra evaluaciones entre areas. Vincula el desempeno individual con los objetivos estrategicos del negocio.',
        },
      },
      {
        competencyId: 30,
        competencyName: 'Entrevistas de seleccion de personal',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Conduce entrevistas basicas siguiendo un guion. Le cuesta evaluar competencias blandas y detectar inconsistencias en el candidato.',
          capable:
            'Disena y conduce entrevistas estructuradas por competencias. Mide fit cultural y tecnico con criterio. Toma decisiones de contratacion fundamentadas.',
          expert:
            'Define el proceso de seleccion y los criterios de evaluacion de la organizacion. Entrena a otros entrevistadores. Su criterio es referencia para decisiones de contratacion clave.',
        },
      },
      {
        competencyId: 31,
        competencyName: 'Creacion de campanas publicitarias',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Colabora en la ejecucion de campanas siguiendo un brief creativo definido por otros. Produce piezas basicas.',
          capable:
            'Disena y ejecuta campanas publicitarias completas: concepto, copy, piezas, segmentacion y medicion. Alinea la campana a objetivos de negocio.',
          expert:
            'Dirige la estrategia creativa publicitaria de la organizacion. Define tendencias de marca. Sus campanas generan impacto medible en awareness, conversion y posicionamiento.',
        },
      },
      {
        competencyId: 32,
        competencyName: 'Desarrollo de programas de capacitacion',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Imparte capacitaciones basicas siguiendo material existente. Le cuesta disenar contenido desde cero o adaptarlo al perfil del participante.',
          capable:
            'Disena e imparte programas de capacitacion completos: diagnostico de necesidades, contenido, dinamicas, evaluacion de aprendizaje. Adapta al perfil de la audiencia.',
          expert:
            'Disena la estrategia de capacitacion y desarrollo organizacional. Mide impacto de la capacitacion en el desempeno. Crea programas escalables y transferibles.',
        },
      },
      {
        competencyId: 33,
        competencyName: 'Analisis de competencia',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Recopila informacion publica de competidores (precios, productos, presencia). La presenta de forma descriptiva sin profundizar en implicaciones estrategicas.',
          capable:
            'Realiza analisis competitivos completos: benchmark de precios, posicionamiento, fortalezas y debilidades. Genera recomendaciones accionables.',
          expert:
            'Disena el sistema de inteligencia competitiva de la organizacion. Anticipa movimientos de competidores. Sus analisis son insumo directo para la estrategia de producto y mercado.',
        },
      },
      {
        competencyId: 34,
        competencyName: 'Desarrollo de contenido multimedia',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Produce contenido basico (imagenes, videos cortos) con herramientas estandar. Requiere guia de estilo y revision de calidad.',
          capable:
            'Produce contenido multimedia profesional y alineado a la marca: video, audio, graficos, animaciones. Gestiona el proceso de produccion completo.',
          expert:
            'Define la estrategia de contenido multimedia de la organizacion. Establece estandares de produccion. Innova en formatos y plataformas para maximizar el impacto.',
        },
      },
      {
        competencyId: 35,
        competencyName: 'Gestion de proyectos de investigacion y desarrollo',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Participa en proyectos de I+D ejecutando tareas asignadas. Documenta avances con supervision. Le cuesta gestionar la incertidumbre inherente a I+D.',
          capable:
            'Planifica y gestiona proyectos de I+D: define alcance, hitos, riesgos. Navega la incertidumbre con metodologia y toma decisiones informadas con ambiguedad.',
          expert:
            'Dirige el portafolio de I+D de la organizacion. Define la hoja de ruta de innovacion. Equilibra riesgo, inversion y potencial de impacto a nivel estrategico.',
        },
      },
      {
        competencyId: 36,
        competencyName: 'Implementacion de sistemas de gestion de calidad',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Participa en auditorias y aplica controles de calidad predefinidos. Conoce los estandares basicos pero no los implementa de forma autonoma.',
          capable:
            'Implementa y mantiene sistemas de gestion de calidad (ISO, Six Sigma, etc.). Realiza auditorias internas, identifica no conformidades y propone acciones correctivas.',
          expert:
            'Disena el sistema de gestion de calidad de la organizacion. Lidera certificaciones. Integra la cultura de calidad en todos los procesos operativos.',
        },
      },
      {
        competencyId: 37,
        competencyName: 'Analisis de metricas de redes sociales',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Extrae metricas basicas de plataformas sociales (alcance, likes, seguidores). Presenta datos sin contexto estrategico.',
          capable:
            'Analiza metricas de redes sociales con profundidad: engagement, conversion, sentimiento, crecimiento. Genera insights accionables y optimiza la estrategia de contenido.',
          expert:
            'Define el framework de analitica social de la organizacion. Integra datos de redes con metricas de negocio. Sus analisis impactan la estrategia de marca y comunicacion.',
        },
      },
      {
        competencyId: 38,
        competencyName: 'Revision de politicas y procedimientos',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Revisa documentos de politicas y procedimientos identificando inconsistencias basicas. Necesita guia para proponer cambios.',
          capable:
            'Audita politicas y procedimientos de forma critica. Identifica brechas, redundancias y riesgos. Propone actualizaciones alineadas a buenas practicas y normativa vigente.',
          expert:
            'Disena el marco de gobernanza de politicas de la organizacion. Define ciclos de revision, aprobacion y comunicacion. Asegura cumplimiento normativo integral.',
        },
      },
      {
        competencyId: 39,
        competencyName: 'Habilidades de servicio',
        competencyType: 'technical',
        descriptions: {
          in_development:
            'Atiende solicitudes siguiendo protocolos establecidos con actitud positiva. Le cuesta improvisar ante situaciones no estandar.',
          capable:
            'Brinda servicio de calidad en situaciones diversas. Anticipa necesidades, resuelve problemas con empatia y genera confianza en el interlocutor.',
          expert:
            'Disena modelos de servicio y capacita equipos en cultura de servicio. Define estandares, mide satisfaccion y convierte el servicio en ventaja competitiva.',
        },
      },
    ]

    for (const competency of competencies) {
      const { competencyId, competencyName, competencyType, descriptions } = competency

      // Buscamos incluyendo registros con soft delete para no colisionar con el PK
      const existingCompetency = await Competency.query()
        .withTrashed()
        .where('competency_id', competencyId)
        .first()

      if (existingCompetency) {
        existingCompetency.competencyName = competencyName
        existingCompetency.competencyType = competencyType
        existingCompetency.deletedAt = null
        await existingCompetency.save()
      } else {
        await Competency.create({ competencyId, competencyName, competencyType })
      }

      for (const levelCode of Object.keys(descriptions) as LevelKey[]) {
        const competencyLevelId = LEVEL_ID_BY_CODE[levelCode]
        const competencyLevelDescription = descriptions[levelCode]

        const existingDescription = await CompetencyLevelDescription.query()
          .withTrashed()
          .where('competency_id', competencyId)
          .where('competency_level_id', competencyLevelId)
          .first()

        if (existingDescription) {
          existingDescription.competencyLevelDescription = competencyLevelDescription
          existingDescription.deletedAt = null
          await existingDescription.save()
        } else {
          await CompetencyLevelDescription.create({
            competencyId,
            competencyLevelId,
            competencyLevelDescription,
          })
        }
      }
    }
  }
}
