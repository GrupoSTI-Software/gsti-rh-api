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
