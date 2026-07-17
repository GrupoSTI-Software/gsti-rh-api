import { BaseSeeder } from '@adonisjs/lucid/seeders'
import TeleworkPolicyTemplate from '../../app/models/telework_policy_template.js'
import type { TeleworkPolicyComponent } from '../../app/models/telework_policy_template.js'
import { sanitizeTeleworkPolicyComponents } from '../../app/helpers/sanitize_telework_policy_content.js'

const TEMPLATE_VERSION = '2023.1'

/**
 * Los 12 componentes obligatorios del numeral 5.2 (incisos a-l) de la
 * NOM-037-STPS-2023, texto migrado literalmente del anexo validado:
 * `.gsti-kg/tech-spec/plantilla-base-politica-teletrabajo-5-2.md`.
 *
 * BORRADOR de arranque anclado al texto oficial (DOF/SIDOF 5691672); Wilvardo
 * lo valida con asesora STPS antes de considerarse definitivo en producción.
 * El dev consume este seed, no inventa el texto legal (ver anexo, nota final).
 */
const TEMPLATE_COMPONENTS: TeleworkPolicyComponent[] = [
  {
    key: '5_2_a',
    clause: '5.2.a',
    title: 'Cultura de prevención de riesgos y seguridad y salud en el teletrabajo',
    body:
      '<p>La empresa promueve entre las personas trabajadoras bajo la modalidad de teletrabajo una ' +
      'cultura de prevención de riesgos de trabajo, fomentando prácticas de seguridad y salud en el ' +
      'lugar donde desempeñan sus actividades. Para ello difunde recomendaciones ergonómicas, pausas ' +
      'activas y medidas de autocuidado, y pone a disposición los canales para reportar condiciones ' +
      'inseguras.</p>',
    required: true,
    order: 1,
  },
  {
    key: '5_2_b',
    clause: '5.2.b',
    title: 'Comunicación con la persona teletrabajadora para evitar el aislamiento',
    body:
      '<p>Con el fin de evitar el aislamiento social de las personas teletrabajadoras, la empresa ' +
      'establece mecanismos de comunicación mediante reuniones presenciales periódicas en el centro ' +
      'de trabajo o a través de las Tecnologías de la Información y Comunicación (TIC), tales como ' +
      'videollamadas, mensajería y correo electrónico, procurando la integración con su equipo y con ' +
      'la organización.</p>',
    required: true,
    order: 2,
  },
  {
    key: '5_2_c',
    clause: '5.2.c',
    title: 'Difusión de procedimientos por medios a distancia',
    body:
      '<p>La empresa facilita los mecanismos de comunicación y difusión a distancia con que cuenta ' +
      '—incluyendo el correo electrónico y otros medios— para que las personas teletrabajadoras ' +
      'conozcan, entre otros, los procedimientos previstos en el artículo 330-C, segundo párrafo, de ' +
      'la Ley Federal del Trabajo, así como las políticas, avisos y comunicados relevantes para su ' +
      'actividad.</p>',
    required: true,
    order: 3,
  },
  {
    key: '5_2_d',
    clause: '5.2.d',
    title: 'Reglas de contacto que respetan la privacidad y la vida familiar',
    body:
      '<p>La empresa define los mecanismos y reglas de contacto entre el centro de trabajo y las ' +
      'personas teletrabajadoras, garantizando su derecho a la privacidad, cuidando que dichos ' +
      'mecanismos no interfieran en la relación trabajo-familia y que sean proporcionales a su ' +
      'objetivo. El contacto se realiza por los medios y en los horarios pactados.</p>',
    required: true,
    order: 4,
  },
  {
    key: '5_2_e',
    clause: '5.2.e',
    title: 'Jornada de trabajo, pausas y derecho a la desconexión',
    body:
      '<p>Se establece la duración del horario de labores pactado y/o la distribución convenida de ' +
      'las jornadas de trabajo, sin exceder los máximos legales y contractuales. Se reconoce el ' +
      '<strong>derecho a las pausas para descanso y a la desconexión</strong> —incluida la ' +
      'desconexión de las TIC de manera digital— al término de la jornada laboral, así como en ' +
      'horarios no laborables, vacaciones, permisos y licencias. Fuera de la jornada, la persona ' +
      'teletrabajadora no está obligada a responder comunicaciones laborales.</p>',
    required: true,
    order: 5,
  },
  {
    key: '5_2_f',
    clause: '5.2.f',
    title: 'Igualdad de derechos respecto del trabajo presencial',
    body:
      '<p>Los derechos de las personas trabajadoras bajo la modalidad de teletrabajo no serán ' +
      'inferiores a los de quienes desempeñan trabajo presencial en el centro de trabajo, incluyendo ' +
      'condiciones laborales, prestaciones, capacitación y oportunidades de desarrollo.</p>',
    required: true,
    order: 6,
  },
  {
    key: '5_2_g',
    clause: '5.2.g',
    title: 'Perspectiva de género y conciliación de la vida personal y laboral',
    body:
      '<p>La empresa promueve la perspectiva de género y permite conciliar la vida personal y ' +
      'familiar de las personas teletrabajadoras, considerando las disposiciones del protocolo para ' +
      'prevenir la discriminación por razones de género y atender casos de violencia y acoso al que ' +
      'se refiere el artículo 132, fracción XXXI, de la Ley Federal del Trabajo.</p>',
    required: true,
    order: 7,
  },
  {
    key: '5_2_h',
    clause: '5.2.h',
    title: 'Tiempo para la lactancia de madres teletrabajadoras',
    body:
      '<p>Durante un máximo de seis meses, las madres teletrabajadoras en periodo de lactancia ' +
      'contarán, dentro de su jornada laboral, con tiempo para alimentar a sus hijas e hijos, ' +
      'pudiendo elegir entre <strong>dos reposos extraordinarios por día de media hora cada ' +
      'uno</strong> o <strong>reducir en una hora su jornada laboral</strong>, en los términos del ' +
      'artículo 170 de la Ley Federal del Trabajo.</p>',
    required: true,
    order: 8,
  },
  {
    key: '5_2_i',
    clause: '5.2.i',
    title: 'Promoción y vigilancia de la salud de la persona teletrabajadora',
    body:
      '<p>La empresa reconoce la importancia de la promoción y vigilancia de la salud de las ' +
      'personas teletrabajadoras, e impulsa acciones de información, prevención y seguimiento del ' +
      'estado de salud relacionadas con su actividad.</p>',
    required: true,
    order: 9,
  },
  {
    key: '5_2_j',
    clause: '5.2.j',
    title: 'Aviso de cambios del lugar de teletrabajo',
    body:
      '<p>Se establecen las mecánicas para que las personas teletrabajadoras informen al patrón, en ' +
      'su caso, los cambios de domicilio del lugar donde desempeñan el teletrabajo, a fin de ' +
      'mantener actualizadas las condiciones de seguridad y salud del lugar de trabajo convenido.</p>',
    required: true,
    order: 10,
  },
  {
    key: '5_2_k',
    clause: '5.2.k',
    title: 'Responsabilidades y obligaciones del patrón y de la persona teletrabajadora',
    body:
      '<p>Se definen de manera precisa las responsabilidades y obligaciones del patrón y de las ' +
      'personas teletrabajadoras, en cumplimiento del artículo 330-B de la Ley Federal del Trabajo, ' +
      'incluyendo las establecidas en el contrato colectivo de trabajo o, en su caso, en el ' +
      'reglamento interior de trabajo.</p>',
    required: true,
    order: 11,
  },
  {
    key: '5_2_l',
    clause: '5.2.l',
    title: 'Mecanismos de reversibilidad del teletrabajo',
    body:
      '<p>Se establecen los mecanismos para aplicar, en su caso, la <strong>reversibilidad del ' +
      'teletrabajo</strong> —incluso de forma temporal—, de acuerdo con lo previsto en el artículo ' +
      '330-G de la Ley Federal del Trabajo, ya sea a solicitud de la persona trabajadora o cuando ' +
      'las condiciones de seguridad y salud lo justifiquen.</p>',
    required: true,
    order: 12,
  },
]

/**
 * Siembra la plantilla base global (una sola fila vigente). Idempotente: si
 * la versión ya existe, no la duplica ni la vuelve a marcar vigente.
 */
export default class extends BaseSeeder {
  async run() {
    const alreadySeeded = await TeleworkPolicyTemplate.query()
      .where('telework_policy_template_version', TEMPLATE_VERSION)
      .first()

    if (alreadySeeded) {
      return
    }

    await TeleworkPolicyTemplate.create({
      teleworkPolicyTemplateVersion: TEMPLATE_VERSION,
      teleworkPolicyTemplateComponents: sanitizeTeleworkPolicyComponents(TEMPLATE_COMPONENTS),
      teleworkPolicyTemplateIsCurrent: true,
    })
  }
}
