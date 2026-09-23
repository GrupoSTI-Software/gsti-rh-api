/**
 * Nombre visible y orden de los 9 grupos del menú tal como quedaron tras la
 * migración `1788282413066000_add_system_module_group_and_order_to_system_modules`
 * — es decir, el estado INMEDIATO ANTERIOR a la reorganización del 2026-09-04
 * (USRH1788282413204). Es lo opuesto de `GROUP_FINAL`: mientras esa constante
 * es "a dónde se llega", esta es "de dónde se venía".
 *
 * Por qué existe: para que el `down()` de `1788282413204000` pueda deshacerse
 * sin adivinar. Una migración reversible necesita el estado previo congelado
 * en código — no basta con "el opuesto lógico" del estado final, porque el
 * orden y los nombres previos no seguían ninguna regla derivable (de ahí
 * nombres como `'ZKSync'` en vez de `'Asistencia y jornada'`, y huecos de
 * orden como 10/20/30... sin relación con el orden final).
 *
 * Cómo se usa: únicamente en el `down()` de esa migración, un `UPDATE` por
 * `system_module_group_key` que restaura `system_module_group_name` y
 * `system_module_group_order` a estos valores. Ver también `PREVIOUS_STATE`
 * (`previews_organization_menu.constant.ts`), su contraparte a nivel de
 * módulo: juntas restauran exactamente lo que dejó `1788282413066000`.
 *
 * Es una copia literal congelada, igual que `GROUP_FINAL` (§9.5 del spec):
 * no se deriva del catálogo vivo (`SYSTEM_MODULE_GROUP_CATALOG`) ni de
 * `GROUP_FINAL`, porque un `down()` debe reproducir un hecho histórico, no
 * el estado actual de un catálogo que puede seguir cambiando.
 *
 * NUNCA editar estos valores para reflejar cambios futuros del menú: si se
 * edita, el `down()` deja de reproducir el estado real anterior a esta
 * migración y la reversión queda rota para siempre.
 */
export const PREVIOUS_GROUPS = [
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
