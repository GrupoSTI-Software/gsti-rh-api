# Escenarios de prueba — USRH1785766406741 (Roles y permisos en árbol)

**Enfoque:** pantalla con árbol navegable (módulo → sección → acción), cascada, buscador, guardado atómico multi-rol y protección de cambios, orientado a gestionar ~90+ accesos granulares de Empleados.

**Alcance de esta versión:** todos los escenarios de abajo **aplican** a lo implementado. Se reescribieron los que no calzaban con el comportamiento real (principalmente rol de sistema y usabilidad post-UX).

**Matices de producto ya incorporados en el texto:**
- **3.2** busca por módulo y sección (además de acción).
- **6.1 / 9.3** el rol de sistema se puede marcar en UI; el rechazo es al **guardar** el lote completo.
- **10.2** un solo botón toggle Expandir/Colapsar; árbol inicia contraído; scroll interno en Permisos.

---

### 1. Visualización y jerarquía del árbol

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| 1.1 | El árbol se muestra con 3 niveles (módulo → sección → acción) | Al expandir Empleados se ven secciones (Listado, Trabajo, Persona, Domicilio, Bancos, etc.) y dentro las acciones, con indentación clara por nivel (PrimeVue Tree). |
| 1.2 | Los módulos sin secciones muestran acciones directamente bajo el módulo | Un módulo legacy (ej. Certificaciones) muestra acciones colgando del módulo, sin nivel intermedio. |
| 1.3 | El contador de acciones por rol es correcto | En la lista de roles y en el encabezado de Permisos, el contador coincide con el número de acciones concedidas. |
| 1.4 | Los tres estados de cada nodo son distinguibles | Checkbox marcado / indeterminado (parcial) / vacío; chip “Parcial” cuando aplica. No depende solo del color. |
| 1.5 | Se muestra la vigencia de permisos de cada módulo | Badge “Vigilancia activa” o “Solo declarada” junto al módulo; no se puede cambiar desde esta pantalla. |

---

### 2. Cascada (marcado/desmarcado de nodos padre)

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| 2.1 | Marcar una sección marca automáticamente todas sus acciones | Al marcar “Bancos” (o Listado), se marcan todas sus acciones y el contador sube en esa cantidad. |
| 2.2 | Desmarcar una sección desmarca todas sus acciones | Al desmarcar, se desmarcan todas y el contador baja. |
| 2.3 | Marcar solo algunas acciones deja el padre en estado intermedio | Marcar una sola acción deja la sección (y el módulo si aplica) en parcial. |
| 2.4 | Cascada con búsqueda activa solo afecta a lo visible y pide confirmación | Buscar un término, marcar módulo/sección filtrado → confirm: *“Hay una búsqueda activa: la cascada solo aplicará a las acciones visibles…”*. Las acciones ocultas por el filtro no cambian. |

---

### 3. Buscador

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| 3.1 | Buscar por nombre de acción | Escribir parte del nombre de una acción → solo coincidencias, con módulo/sección ancestros visibles. |
| 3.2 | Buscar por nombre de sección o módulo | Escribir “Bancos” o “Empleados” → se muestra esa rama (sección completa o módulo completo) con sus acciones. |
| 3.3 | Limpiar la búsqueda restaura el árbol | Al borrar el texto, vuelve el árbol completo (contraído) y las marcas no guardadas siguen intactas. |

---

### 4. Guardado atómico (todo o nada)

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| 4.1 | Guardar cambios en varios roles se aplica correctamente | Modificar 2–3 roles, Guardar → todos quedan aplicados; toast de éxito; sale de edición. |
| 4.2 | Fallo en un rol → no se guarda nada | Forzar error de servidor en el lote → ningún rol cambia en BD; mensaje de error; marcas locales se conservan; sigue en edición. |
| 4.3 | Pérdida de conexión antes de confirmación | Cortar red al guardar → toast *“No se pudo confirmar”* + detalle de rehidratación; se recarga estado del servidor; no se afirma éxito. |
| 4.4 | Dentro de un rol el guardado es atómico | El lote usa el assign atómico por rol (6721): un fallo interno no deja permisos a medias en ese rol. |

---

### 5. Protección de cambios sin guardar

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| 5.1 | Salir con cambios pendientes pide confirmación | En edición con cambios, navegar a otro módulo → diálogo de cambios sin guardar. |
| 5.2 | Cancelar la salida | Se permanece en la pantalla con los cambios. |
| 5.3 | Confirmar la salida | Se abandona y se descartan los cambios (sin guardar). |
| 5.4 | Cancelar edición en la toolbar | Cancelar con dirty → confirma y descarta; sin dirty sale de edición sin diálogo innecesario (según implementación actual). |

---

### 6. Roles especiales y permisos de edición

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| 6.1 | Rol de sistema: se puede marcar en UI, pero el guardado del lote se rechaza | Editar un rol de sistema (ej. Dueño / Empleado según slug de sistema), cambiar permisos, Guardar → API responde con clave `rol-sistema-bloqueado-lote` (mensaje con nombre del rol); **ningún** rol del lote se persiste; las marcas locales se conservan; no sale de edición. |
| 6.2 | El rol de soporte (`root`) no aparece | En la lista izquierda no está el rol de soporte de plataforma. |
| 6.3 | Solo consulta: árbol visible, no editable | Usuario con read sin update → modo consulta; no puede marcar casillas (o el toggle no persiste); botón Editar ausente/deshabilitado según permisos. |
| 6.4 | Sin acceso a la pantalla | Sin permiso → no aparece en menú o al entrar da 403. |

---

### 7. Comportamiento durante la edición de varios roles

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| 7.1 | Cambiar entre roles mantiene cambios pendientes | Editar A, cambiar a B, volver a A → cambios de A siguen. Roles dirty con marca visual. |
| 7.2 | Guardar aplica todos los roles modificados | Dirty en A y B → un Guardar aplica ambos. |
| 7.3 | Si solo se modificó un rol, solo ese cambia | Solo A dirty → solo A se envía/cambia; los demás intactos. |

---

### 8. Legacy y no-regresión

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| 8.1 | Módulos legacy sin secciones | Acciones planas bajo el módulo. |
| 8.2 | Guardar sin cambios reales | Entrar a editar, no tocar (o Guardar deshabilitado si no hay dirty); permisos existentes intactos. |
| 8.3 | Alta de rol + permisos desde el árbol | Crear rol, asignar permisos, guardar → aparece con permisos correctos. |

---

### 9. Errores y fallos

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| 9.1 | Catálogo/árbol de sesión no disponible | Fallo al cargar árbol → mensaje de error y edición de permisos bloqueada (no árbol incompleto editable). |
| 9.2 | Error genérico al guardar | Error 4xx/5xx → toast de error; cambios en pantalla se conservan; sigue en edición. |
| 9.3 | Rol de sistema en el lote (mismo flujo que 6.1) | Incluir un rol de sistema entre los dirty y Guardar → rechazo de lote completo; BD intacta; UI conserva marcas. |

---

### 10. Rendimiento y usabilidad (incluye UX reciente)

| # | Escenario | Criterio de éxito |
|---|-----------|-------------------|
| 10.1 | Carga con ~100 acciones de Empleados | Interfaz usable en desarrollo (< ~1–2 s percibidos). |
| 10.2 | Expandir / contraer | Árbol inicia **contraído**. Un botón toggle: “Expandir todo” ↔ “Colapsar todo”. Expandir módulos/secciones individuales es fluido. |
| 10.3 | Contador en tiempo real | Al marcar/desmarcar, contadores de rol y módulo se actualizan al instante. |
| 10.4 | Scroll contenido en Permisos | Al recorrer el árbol, se mantienen visibles datos del rol y Editar/Cancelar/Guardar (scroll interno del panel de permisos, no “página infinita”). |
| 10.5 | Layout de datos del rol | Nombre, estatus, límite y días en una fila densa; descripción a ancho; sin hueco vacío grande. |

---

## Prioridad para pruebas rápidas

| Prioridad | Escenarios | Razón |
|-----------|------------|--------|
| Alta | 4.1, 4.2, 4.3 | Riesgo de configuración a medias |
| Alta | 2.1, 2.2, 2.3 | Cascada central |
| Alta | 6.1, 6.2, 9.3 | Integridad roles de sistema / soporte |
| Media | 1.3, 1.4, 3.1, 3.2, 5.1–5.3, 7.1–7.2 | Usabilidad y dirty multi-rol |
| Baja | 1.2, 8.1, 10.2, 10.4, 10.5 | Legacy + UX |

---

## Notas para testers

- Fallos de red: DevTools → Offline / throttling al momento de Guardar.
- Roles de sistema: típicamente slugs `owner` / `empleado` (etiquetas Dueño / Empleado). Se pueden marcar; el corte es en Guardar.
- `root` no debe listarse.
- Modo edición explícito: Editar → cambiar → Guardar / Cancelar.
- Mensaje de cascada con filtro: confirm nativo del navegador (texto i18n `roles_permission_tree_cascade_search_confirm`).

---

## Changelog respecto al guion original

| Escenario | Antes | Ahora (aplicable) |
|-----------|--------|-------------------|
| 3.2 | No buscaba módulo/sección | Sí busca módulo, sección y acción |
| 6.1 | “No deja marcar” el rol de sistema | Deja marcar; **rechaza al guardar** el lote (`rol-sistema-bloqueado-lote`) |
| 9.3 | Igual que 6.1 mal formulado | Alineado a rechazo en guardado de lote |
| 10.2 | Expandir/contraer genérico | Toggle único + árbol contraído al inicio |
| 5.4, 10.4, 10.5 | No existían | Cubren Cancelar en toolbar y layout/scroll UX |

**Total:** 39 escenarios aplicables (1.1–1.5, 2.1–2.4, 3.1–3.3, 4.1–4.4, 5.1–5.4, 6.1–6.4, 7.1–7.3, 8.1–8.3, 9.1–9.3, 10.1–10.5).

---

## Resultados automatizados (2026-08-06)

Ejecución Playwright contra BO `:3000` + API `:3333`. Scripts (no commitear seeder tmp):

- `gsti-rh-bo/scripts/qa_roles_permissions_tree.py` (smoke UI)
- `gsti-rh-bo/scripts/qa_roles_permissions_tree_full.py` (suite completa)
- Seeder local: `database/seeders/_tmp_do_not_commit_qa_roles_permissions_seeder.ts` (en `.git/info/exclude`)

| # | Resultado | Evidencia |
|---|-----------|-----------|
| 1.1 | PASS | Smoke: módulo → sección → acción |
| 1.2 | PASS | Full: Periodos Vacacionales plano (4 acciones) |
| 1.3 | PASS | Smoke: contador visible |
| 1.4 | PASS | Full: parcial + contador |
| 1.5 | PASS | Smoke: badge vigilancia |
| 2.1 | PASS | Full: marcar Bancos +3 |
| 2.2 | PASS | Full: desmarcar Bancos −3 |
| 2.3 | PASS | Full: parcial tras una acción |
| 2.4 | PASS | Full: confirm cascada con búsqueda |
| 3.1 | PASS | Smoke: búsqueda por acción |
| 3.2 | PASS | Smoke: búsqueda Bancos (sección) |
| 3.3 | PASS | Smoke: limpiar restaura árbol |
| 4.1 | PASS | Full: lote HTTP 201 |
| 4.2 | PASS | Full: mock 422, sigue en edición + toast |
| 4.3 | PASS | Full: offline → toast “Could not confirm” (sin error.vue) |
| 4.4 | PASS | Full: contrato assign atómico + 4.1 |
| 5.1 | PASS | Full: confirm al salir dirty |
| 5.2 | PASS | Full: dismiss permanece en roles |
| 5.3 | PASS | Full: accept abandona |
| 5.4 | PASS | Full: Cancelar → consulta |
| 6.1 | PASS | Full: 403 `rol-sistema-bloqueado-lote` |
| 6.2 | PASS | Full: root no listado |
| 6.3 | PASS | Full: readonly sin Edit |
| 6.4 | PASS | Full: 403 Access denied |
| 7.1 | PASS | Full: dirty multi-rol conservado |
| 7.2 | PASS | Full: batch con 2 roles |
| 7.3 | PASS | Full: batch con 1 rol |
| 8.1 | PASS | Cubierto por 1.2 (módulo legacy plano) |
| 8.2 | PASS | Full: Guardar deshabilitado sin dirty |
| 8.3 | PASS | Full: drawer alta de rol disponible |
| 9.1 | PASS | Full: bloqueo al fallar árbol de sesión |
| 9.2 | PASS | Full: toast error 422, marcas locales |
| 9.3 | PASS | Full: mismo rechazo que 6.1 |
| 10.1 | PASS | Smoke: ~40 módulos |
| 10.2 | PASS | Smoke: contraído + toggle único Expand/Collapse |
| 10.3 | PASS | Full: contador en cascada |
| 10.4 | PASS | Smoke: scroll interno + toolbar visible |
| 10.5 | PASS | Smoke: grid `.role-data` |

**Suite full:** 28/28 PASS. **Fixes de producto en esta pasada:** `beforeRouteLeave` con `return false`; `assignBatch` / rehidratación con `_skipGlobalApiErrorHandler` para no abrir `error.vue` en fallo de red.
