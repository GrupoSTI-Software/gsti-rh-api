# Prueba manual — Adjuntar la evidencia de la declaración de equipo propio

**Problema:** la declaración de equipo propio de la NOM-037 se guardaba como un dicho: la empresa anotaba la descripción del equipo, la cuota mensual y las condiciones pactadas, pero no tenía dónde guardar el **acuerdo firmado** que respalda todo eso. Sin ese respaldo, una declaración se podía ajustar o terminar sin dejar prueba de lo pactado, no había forma de volver a bajar el documento cuando hacía falta, y una foto subida como respaldo podía arrastrar datos que nadie quería conservar, como el lugar donde se tomó.

**Solución:** cada declaración de equipo propio puede llevar **una evidencia adjunta**: el archivo con el que se respalda, que es el PDF del acuerdo o una foto del equipo. Al declarar, el cajón del alta gana el campo **Evidencia o condiciones (opcional)** y, ya guardada, la declaración queda marcada con el chip **Con evidencia adjunta** y su botón **Descargar evidencia**; si no se adjunta nada, la declaración queda **Sin evidencia** y sin botón. La evidencia viaja con la versión: una declaración cerrada conserva su archivo y se puede descargar desde el histórico **Declaraciones anteriores**, mientras que **el ajuste no arrastra la evidencia** y la versión nueva nace **Sin evidencia**. Solo se aceptan archivos PDF, JPG, PNG o WEBP de hasta 10 MB, el cajón avisa antes de enviar (por tipo o por tamaño) y deja quitar el archivo elegido, y lo que se guarda pierde los datos con que se tomó: una foto ya no lleva la ubicación.

Ejemplo: es como el contrato de la renta con sus anexos. El anexo firmado se archiva junto al contrato y se puede volver a bajar cuando haga falta; si se renegocia el monto, el anexo viejo se queda guardado con el contrato viejo y el nuevo empieza sin anexo; y si el anexo era una foto, antes de guardarla se le quitan los datos del lugar donde se tomó.

## Glosario

- **Equipo propio declarado:** la empresa registra que la persona cubre una categoría de la norma con su propio equipo y con una cuota mensual; no es un bien entregado por la empresa.
- **Acuerdo (adenda):** el documento que respalda una declaración de equipo propio; en esta prueba, el PDF del acuerdo firmado o una foto del equipo.
- **Evidencia de la declaración:** el archivo que se adjunta a una declaración para respaldarla; el mismo documento del acuerdo, ya guardado.
- **Categoría de la norma:** cada uno de los tres grupos que la matriz vigila: **Silla ergonómica**, **Equipo de cómputo o impresión** y **Aditamento**.
- **Declaración vigente:** la versión que está en efecto hoy en una categoría (una sola por categoría).
- **Ajuste:** cambiar la cuota, la descripción o las condiciones de una declaración vigente sin perder la versión anterior.
- **Término:** cerrar una declaración vigente con su fecha de fin y el motivo por el que se cierra.
- **Histórico:** el bloque plegado donde viven las versiones ya cerradas de una categoría.
- **Listado de teletrabajadores:** el registro obligatorio de la NOM-037 con los colaboradores cuyo teletrabajo representa el 40% o más de su jornada.

## 1. Preparar

Prerrequisito: esta rama del API y la del backoffice están levantadas, y la base ya trae los módulos **Empleados** y **Activos e insumos**.

Ejecuta una vez el sembrador de QA compartido:

```bash
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Qué deja listo para esta prueba:

- **QA Fundadora**: la empresa donde se hace todo el recorrido, con la **cuota estándar** de equipo propio en `350.00`.
- Los **dos colaboradores** de la tabla de abajo, cada uno con el estado que prueba un escenario.
- Los **tipos de activo** con su categoría de la norma.
- Las **dos cuentas** de la §2.

**Señal para reconocer lo nuestro:** los colaboradores de esta prueba son `QA-TEL-02` y `QA-TEL-03`; cualquier otro colaborador con código `QA-TEL-` es de otra historia y no se toca.

Estado de cada colaborador (lo que deja el sembrador):

| Código | Nombre | Modalidad y % | Con qué arranca | Escenario |
|---|---|---|---|---|
| `QA-TEL-02` | Ulises Pardo Gil | Híbrido, 20% | Una versión cerrada de la silla en el histórico, que arranca en **Declaraciones anteriores (1)**: **Silla de escritorio anterior**, del 01/06/2026 al 31/08/2026, **$300.00 al mes**, motivo **Cambio de condiciones** y sin archivo; ninguna declaración vigente —las tres categorías por cubrir— y ningún acuerdo firmado | 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.8 |
| `QA-TEL-03` | Vera Quintero Lira | Híbrido, 40% | Ninguna declaración de equipo propio y ningún activo | 4.6, 4.8 |

**Archivos que prepara quien prueba** (la evidencia no viene sembrada: se crea para el recorrido):

- **El PDF del acuerdo** (`acuerdo-equipo-propio.pdf`): abre tu procesador de textos, escribe unas líneas del acuerdo del equipo propio y **expórtalo como PDF** con ese nombre.
- **Una foto del celular**: una foto tomada con la cámara del celular con la ubicación activada; sirve una que ya tengas en el carrete.
- **Un documento de Word** (`acuerdo-equipo-propio.docx`): un documento breve, del mismo procesador, guardado en formato Word.
- **Un PDF pesado** (`acuerdo-equipo-propio-pesado.pdf`): un PDF de más de 10 MB, por ejemplo uniendo varias fotos en un solo PDF.

## 2. Usuarios

Las dos cuentas entran por el backoffice con el mismo flujo: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña**, botón **Entrar**. Las dos usan la contraseña de prueba `password`.

| | Correo | Contraseña | Login | Permisos (variante) | Para qué se usa |
|---|---|---|---|---|---|
| **A** | `qa-own-equipment-full@gsti-tests.local` | `password` | Backoffice | lectura de **Empleados** y de **Activos e insumos** + administrar los suministros del colaborador (declara, ajusta y termina; adjunta la evidencia) | Escenarios 4.1 a 4.6 y 4.8 |
| **B** | `qa-own-equipment-readonly@gsti-tests.local` | `password` | Backoffice | lectura de **Empleados** y de **Activos e insumos**, **sin** administrar los suministros del colaborador | Escenario 4.7 (no ve las acciones ni el campo de archivo) |

Las dos cuentas pueden abrir la pantalla con la que arranca el backoffice (**Monitor de asistencia**): el sembrador concede la lectura de ese módulo a todos los roles de QA, así que la sesión no empieza en un aviso de permisos.

## 3. Dónde probar

La declaración vive dentro de la **matriz Insumos de teletrabajo** de la ficha del colaborador, en la sección **Activos**.

Para entrar: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña** con la cuenta que toque, botón **Entrar**. Al entrar, el backoffice abre siempre la pantalla **Monitor de asistencia**, que no es donde se prueba: del menú lateral entra a **Empleados**.

Para elegir la empresa (si el usuario tiene más de una): arriba a la derecha abre **Mi cuenta** (el avatar) y en el campo **Empresa** elige **QA Fundadora**.

Para llegar a la ficha: menú lateral → **Empleados**; busca a la persona por su código de nómina (por ejemplo `QA-TEL-02`) y, en su tarjeta, pulsa **Ver detalles**. La ficha abre en la sección **Información del empleado**.

La sección es **Activos**: está en el submenú lateral de la ficha, **al final**, con el icono de un portátil. Dentro, arriba, está la tarjeta **Insumos de teletrabajo**.

Cómo se lee la matriz, de arriba a abajo: el título; la leyenda que dice si el registro es obligatorio o preventivo; el chip de resumen; y las tres categorías de la norma, **cada una en su renglón** —el rótulo de la categoría, su chip de estado al extremo derecho y, debajo, lo que la cubre: los activos con su folio y sus chips, o la **declaración de equipo propio** (su descripción, sus condiciones si las hay, la línea con **Desde el …** y **$… al mes**, el chip del origen de la cuota, el chip de la evidencia y, si la categoría tiene versiones cerradas, el bloque plegado **Declaraciones anteriores**), o la acción **Declarar equipo propio** cuando la categoría está pendiente y la cuenta puede escribir.

Dónde se ve la **evidencia**: justo después del chip del origen de la cuota (**Cuota estándar** o **Cuota ajustada**) va el chip de la evidencia —**Con evidencia adjunta** o **Sin evidencia**— y, cuando hay archivo, su botón **Descargar evidencia** a la derecha. Dentro del bloque plegado **Declaraciones anteriores**, cada versión cerrada trae la misma pareja: el chip de su evidencia y, si la conserva, su botón **Descargar evidencia**.

URL directa de la sección: `http://127.0.0.1:3000/employees/` seguida del identificador propio de la ficha abierta y de `/assets`; la dirección **no** lleva `/es`.

---

## 4. Escenarios que se recorren

Entra con el Usuario A (`qa-own-equipment-full@gsti-tests.local`) y elige la empresa **QA Fundadora**.

Orden del recorrido: los escenarios se recorren **en orden**. Los Escenarios 4.1 a 4.5 escriben declaraciones y evidencia sobre **Ulises Pardo Gil**, y el **Escenario 4.7** revisa ese mismo colaborador ya con ese estado, así que hay que llegar a él con esos cinco hechos. El **Escenario 4.6** usa a **Vera Quintero Lira**, que se queda **sin declarar** porque su cajón solo se abre para probar los archivos que no se aceptan. El **Escenario 4.8** vuelve sobre **Ulises Pardo Gil** y sobre el cajón del alta de **Vera Quintero Lira**.

### 4.1 Declarar equipo propio adjuntando el PDF del acuerdo

Objetivo: comprobar que al declarar equipo propio adjuntando el archivo del acuerdo la declaración queda marcada **Con evidencia adjunta**, ofrece el botón que baja ese archivo y el resumen deja de contar la categoría como pendiente.

1. Con el Usuario A, abre la ficha de **Ulises Pardo Gil** (`QA-TEL-02`, Híbrido 20%) y entra a la sección **Activos**.
2. La tarjeta **Insumos de teletrabajo** trae la leyenda **Registro preventivo: no está en el listado de teletrabajadores** y el chip de resumen **2 sin cubrir**. El renglón **Silla ergonómica** muestra el chip **Sin cubrir** y su botón **Declarar equipo propio**. Debajo está el bloque plegado **Declaraciones anteriores (1)**, con la versión cerrada que dejó el sembrador: **Silla de escritorio anterior**, **$300.00 al mes**, periodo **01/06/2026 a 31/08/2026**, motivo **Cambio de condiciones** y el chip **Sin evidencia**, sin botón de descarga.
3. Pulsa **Declarar equipo propio** en el renglón **Silla ergonómica**. Se abre por la derecha un cajón titulado **Declarar equipo propio: Silla ergonómica**, con los campos **Descripción del equipo**, **Condiciones pactadas**, **Fecha de inicio**, **Cuota mensual (MXN)** y **Evidencia o condiciones (opcional)** —con la ayuda **PDF, JPG, PNG o WEBP de hasta 10 MB.**—, y los botones **Cancelar** y **Guardar**.
4. Llena **Descripción del equipo** con `Silla ergonomica de casa` y **Condiciones pactadas** con `Acuerdo firmado el 1 de octubre`.
5. En **Fecha de inicio** elige el 1 de noviembre de 2026 (el campo queda como `2026-11-01`) y **no toques la Cuota mensual (MXN)**: llega precargada con la cuota estándar (`350`).
6. En **Evidencia o condiciones (opcional)** pulsa el selector de archivo, busca `acuerdo-equipo-propio.pdf` y elígelo. Debajo del campo aparece el nombre del archivo elegido y el botón **Quitar archivo**.
7. Pulsa **Guardar**.
8. Ya guardada, en el renglón **Silla ergonómica** pulsa **Descargar evidencia** y guarda el archivo.

**Qué debe verse:**

- El cajón se cierra y aparece el aviso de guardado: **Silla ergonómica** con **Declaración guardada.**
- En el renglón **Silla ergonómica**, el chip **Sin cubrir** se cambió por **Equipo propio declarado**; debajo está la declaración **Silla ergonomica de casa**, sus condiciones **Acuerdo firmado el 1 de octubre**, la línea **Desde el 01/11/2026**, **$350.00 al mes**, el chip **Cuota estándar** y, junto a ellos, el chip **Con evidencia adjunta** con su botón **Descargar evidencia** a la derecha.
- El chip de resumen de la tarjeta pasó de **2 sin cubrir** a **1 sin cubrir**.
- Al pulsar **Descargar evidencia**, el navegador baja un archivo llamado `acuerdo-equipo-propio.pdf`; al abrirlo es el mismo PDF del acuerdo que se adjuntó.
- **Negativo a comprobar a propósito:** la declaración **no** queda **Sin evidencia** —el chip es **Con evidencia adjunta** y el botón de descarga está— y el archivo descargado no baja vacío ni con otro nombre.

**Qué significa cada cosa que se ve:**

- **Insumos de teletrabajo**: el nombre de la tarjeta; agrupa las tres categorías que la norma obliga a vigilar.
- **Registro preventivo: no está en el listado de teletrabajadores**: la persona teletrabaja, así que su cumplimiento se sigue, pero por debajo del 40% no entra al listado obligatorio; su registro es de seguimiento y no exigible.
- **Silla ergonómica / Equipo de cómputo o impresión / Aditamento**: las tres categorías de la norma, siempre en este orden.
- **Estado de la categoría** (el chip de cada renglón): puede valer **Entregado** (la empresa ya le entregó cuando menos un activo de esa categoría), **En envío** (lo tiene en camino, todavía no en sus manos), **Equipo propio declarado** (no es un bien entregado por la empresa: registra que la persona pone su equipo y la cuota que se le paga por usarlo), **Sin cubrir** (falta y así cuenta como pendiente) o **Sin entregar** (no se le ha entregado; solo aplica al Aditamento, que la norma no exige cubrir).
- **Declarar equipo propio**: la acción que ofrece una categoría pendiente; al declararla desaparece de ese renglón.
- **Evidencia o condiciones (opcional)**: el campo del cajón con el que se adjunta el archivo que respalda la declaración; la ayuda que trae debajo dice qué se acepta (**PDF, JPG, PNG o WEBP de hasta 10 MB**).
- **Quitar archivo**: el botón que saca el archivo elegido del campo **Evidencia o condiciones (opcional)** sin tirar lo demás que se capturó.
- **Declaración guardada.**: el aviso de que el alta se registró; arriba aparece el nombre de la categoría declarada.
- **Desde el 01/11/2026**: la fecha desde la que rige el uso del equipo propio y su cuota.
- **$350.00 al mes**: la cuota mensual de la versión vigente, en pesos y con dos decimales.
- **Cuota estándar**: el origen de la cuota vigente; quiere decir que el monto coincide con la cuota estándar de la empresa. En los escenarios siguientes se remite a este.
- **Con evidencia adjunta**: la declaración lleva un archivo que la respalda; es el que baja su botón **Descargar evidencia**.
- **Sin evidencia**: la declaración no lleva ningún archivo.
- **Descargar evidencia**: el botón que baja el archivo con el que se respaldó esa versión de la declaración; solo está donde hay evidencia que bajar.
- **2 sin cubrir / 1 sin cubrir**: cuántas categorías obligatorias están pendientes. Cuenta solo las que están **Sin cubrir** y las que están **En envío**; lo declarado como equipo propio y lo que no aplica (el aditamento) no se cuentan.

### 4.2 Ajustar la cuota de una declaración con evidencia

Objetivo: comprobar que al ajustar una declaración que tenía evidencia la versión nueva nace **Sin evidencia** —sin arrastrar el archivo— y la versión que se cierra conserva la suya con su botón de descarga.

1. Con el Usuario A, en la misma ficha de **Ulises Pardo Gil** (`QA-TEL-02`), sección **Activos**.
2. En el renglón **Silla ergonómica** (declaración **Silla ergonomica de casa**, con el chip **Con evidencia adjunta**) pulsa **Ajustar cuota**.
3. Se abre el cajón **Ajustar declaración: Silla ergonómica**, con **Cuota mensual (MXN)** precargada con la cuota vigente, **Vigente desde**, **Descripción del equipo** y **Condiciones pactadas** precargadas, y la nota **La versión nueva queda sin evidencia ni respaldo de adenda**. **No hay campo de archivo.**
4. En **Cuota mensual (MXN)** captura `420`.
5. En **Vigente desde** elige el 1 de diciembre de 2026 (el calendario no deja elegir una fecha igual o anterior al inicio de la vigente).
6. Pulsa **Guardar**.

**Qué debe verse:**

- El cajón se cierra y aparece el aviso **Silla ergonómica** con **Declaración ajustada.**
- El renglón **Silla ergonómica** sigue en **Equipo propio declarado**, ahora con **Silla ergonomica de casa**, sus condiciones, **Desde el 01/12/2026**, **$420.00 al mes**, el chip **Cuota ajustada** y el chip **Sin evidencia** —sin botón de descarga—.
- El bloque plegado **Declaraciones anteriores (2)** aparece debajo con dos renglones: el primero es la versión que se acaba de cerrar —**Silla ergonomica de casa**, **$350.00 al mes**, periodo **01/11/2026 a 30/11/2026**, motivo **Ajuste de cuota** y el chip **Con evidencia adjunta** con su botón **Descargar evidencia**— y el segundo la que ya estaba, **Silla de escritorio anterior**, **$300.00 al mes**, periodo **01/06/2026 a 31/08/2026**, motivo **Cambio de condiciones** y el chip **Sin evidencia**, sin botón.
- El chip de resumen se queda como estaba (**1 sin cubrir**): la categoría sigue cubierta, ahora por la versión nueva.
- **Negativo a comprobar a propósito:** el cajón del ajuste no ofrece ningún campo de archivo, así que la versión nueva no puede heredar la evidencia; y la evidencia no se pierde ni se duplica: sigue en el renglón cerrado del histórico.

**Qué significa lo nuevo aquí:**

- **Ajustar cuota**: la acción que abre la captura del ajuste sobre la versión vigente de esa categoría.
- **Vigente desde**: la fecha a partir de la cual rige la versión nueva; la anterior se cierra el día anterior.
- **La versión nueva queda sin evidencia ni respaldo de adenda**: el aviso del ajuste; la versión que nace no arrastra el archivo de la anterior.
- **Declaración ajustada.**: el aviso de que el ajuste se registró.
- **Declaraciones anteriores (2)**: el bloque plegado con las versiones cerradas de esa categoría; el número entre paréntesis es cuántas hay (aquí, la que acaba de cerrar el ajuste y la que ya estaba). Cada renglón del histórico trae la descripción de esa versión, su cuota, su periodo (**{inicio} a {fin}**, en formato `dd/mm/aaaa`), su motivo de cierre y su chip de evidencia, con su botón **Descargar evidencia** solo si conserva el archivo.

### 4.3 Descargar la evidencia de una declaración ya cerrada desde el histórico

Objetivo: comprobar que una declaración cerrada conserva su evidencia y que su archivo se puede volver a bajar desde el histórico, aunque la versión vigente de esa categoría ya no la tenga.

1. Con el Usuario A, en la ficha de **Ulises Pardo Gil** (`QA-TEL-02`), sección **Activos**, renglón **Silla ergonómica**.
2. Despliega el bloque **Declaraciones anteriores (2)**.
3. En el renglón de la versión que cerró el ajuste (**Silla ergonomica de casa**, **$350.00 al mes**, periodo **01/11/2026 a 30/11/2026**, motivo **Ajuste de cuota**) revisa su chip **Con evidencia adjunta** y pulsa **Descargar evidencia**. El otro renglón, el de **Silla de escritorio anterior**, trae el chip **Sin evidencia** y no tiene botón.
4. Abre el archivo que bajó.

**Qué debe verse:**

- El renglón cerrado trae el chip **Con evidencia adjunta** y su botón **Descargar evidencia**.
- Al pulsarlo, el navegador baja un archivo llamado `acuerdo-equipo-propio.pdf`; al abrirlo es el mismo PDF del acuerdo que se adjuntó en el Escenario 4.1.
- **Negativo a comprobar a propósito:** la versión vigente de la categoría (chip **Sin evidencia**) **no** trae botón, y el renglón que dejó el sembrador (**Silla de escritorio anterior**) tampoco: el botón solo está en el renglón del histórico que sí conserva su archivo.

**Qué significa lo nuevo aquí:**

- Que el botón **Descargar evidencia** viva **dentro del histórico**: la evidencia pertenece a la versión con la que se guardó, así que una versión cerrada la conserva y se puede bajar aunque ya no rija.

### 4.4 Adjuntar una foto del celular: al bajarla ya no trae la ubicación

Objetivo: comprobar que se puede adjuntar como evidencia una foto del celular y que el archivo que después se descarga ya no lleva la ubicación con la que se tomó.

1. Con el Usuario A, en la ficha de **Ulises Pardo Gil** (`QA-TEL-02`), sección **Activos**.
2. En el renglón **Equipo de cómputo o impresión** (chip **Sin cubrir**) pulsa **Declarar equipo propio**.
3. Llena **Descripción del equipo** con `Laptop propia`, deja **Condiciones pactadas** vacío, elige **Fecha de inicio** el 1 de noviembre de 2026 y deja la **Cuota mensual (MXN)** como llega.
4. En **Evidencia o condiciones (opcional)** elige la foto tomada con el celular (por ejemplo una del carrete, tomada con la ubicación activada).
5. Pulsa **Guardar**.
6. Ya guardada, en el renglón **Equipo de cómputo o impresión** pulsa **Descargar evidencia** y guarda el archivo.
7. Compara la foto original del carrete con la evidencia que se bajó: revisa la información de cada una (la ficha que el visor de fotos muestra con el lugar y la fecha en que se tomó).

**Qué debe verse:**

- El renglón **Equipo de cómputo o impresión** queda en **Equipo propio declarado**, con la declaración **Laptop propia**, **Desde el 01/11/2026**, **$350.00 al mes**, el chip **Cuota estándar** y, junto a ellos, el chip **Con evidencia adjunta** con su botón **Descargar evidencia**.
- El chip de resumen de la tarjeta pasó de **1 sin cubrir** a **Completo**.
- El archivo que baja es la misma foto que se adjuntó (se ve la misma imagen), pero al abrir su información **ya no aparece ningún lugar ni coordenadas**: donde la foto original mostraba el lugar o el mapa donde se tomó, la evidencia descargada no muestra nada.
- **Negativo a comprobar a propósito:** la foto original del carrete **sí** trae su ubicación; la evidencia que se bajó **no**. Lo demás de la foto no cambia: la imagen se ve igual.

**Cómo se revisa la ubicación de una foto:** ábrela con el visor de fotos de tu computadora y mira su ficha o su información, la parte donde el visor anota dónde y cuándo se tomó. Es el mismo dato que aparece cuando compartes una foto y el teléfono te avisa que lleva el lugar donde la tomaste.

**Qué significa lo nuevo aquí:**

- **Laptop propia** y **Completo**: la primera es solo la descripción capturada en este alta; el segundo es el chip de resumen, y aparece cuando ya no queda ninguna categoría pendiente ni en camino.
- Que la evidencia que se descarga **no** conserve la ubicación: lo que se guarda se limpia de los datos con que se tomó el archivo, para no arrastrar el lugar donde se hizo la foto.

### 4.5 Declarar sin archivo

Objetivo: comprobar que se puede declarar equipo propio sin adjuntar nada, y que en ese caso la declaración queda **Sin evidencia** y sin el botón de descarga.

1. Con el Usuario A, en la ficha de **Ulises Pardo Gil** (`QA-TEL-02`), sección **Activos**.
2. En el renglón **Aditamento** (chip **Sin entregar**) pulsa **Declarar equipo propio**.
3. Llena **Descripción del equipo** con `Monitor propio` y elige **Fecha de inicio** el 1 de noviembre de 2026; deja **Condiciones pactadas** vacío, deja la **Cuota mensual (MXN)** como llega y **no elijas ningún archivo en Evidencia o condiciones (opcional)**.
4. Pulsa **Guardar**.

**Qué debe verse:**

- El cajón se cierra y aparece el aviso **Aditamento** con **Declaración guardada.**
- El renglón **Aditamento** queda en **Equipo propio declarado**, con la declaración **Monitor propio**, **Desde el 01/11/2026**, **$350.00 al mes**, el chip **Cuota estándar** y el chip **Sin evidencia**.
- **Negativo a comprobar a propósito:** en ese renglón **no** está el botón **Descargar evidencia**; el chip **Sin evidencia** aparece solo, sin botón. El alta no se cae por dejar el campo **Evidencia o condiciones (opcional)** vacío.
- El chip de resumen de la tarjeta sigue en **Completo** (el aditamento no cuenta como pendiente).

**Qué significa lo nuevo aquí:**

- Que declarar equipo propio **sin archivo** sea un alta válida: la evidencia es un respaldo, no un requisito; cuando falta, la declaración queda **Sin evidencia** y simplemente no ofrece la descarga.

(Lo demás que se ve es lo ya explicado en el Escenario 4.1.)

### 4.6 Un documento de Word y un PDF pesado: el cajón avisa antes de enviar y deja quitar el archivo

Objetivo: comprobar que el cajón del alta avisa en cuanto se elige un archivo de un tipo que no se acepta y uno que pasa del tamaño, que **Guardar** no dispara nada mientras ese archivo siga puesto, y que **Quitar archivo** lo saca sin perder lo demás que ya se capturó.

1. Con el Usuario A, abre la ficha de **Vera Quintero Lira** (`QA-TEL-03`, Híbrido 40%) y entra a **Activos**. La leyenda dice **Obligatorio: este colaborador está en el listado de teletrabajadores (NOM-037 5.7, LFT 330-E)** y el resumen es **2 sin cubrir**.
2. En el renglón **Silla ergonómica** pulsa **Declarar equipo propio**.
3. Llena **Descripción del equipo** con `Silla propia`, **Condiciones pactadas** con `Sin adenda`, elige **Fecha de inicio** el 1 de septiembre de 2026 y captura **Cuota mensual (MXN)** `300`.
4. En **Evidencia o condiciones (opcional)** elige el documento de Word `acuerdo-equipo-propio.docx`.

**Qué debe verse (el tipo que no se acepta):**

- El cajón avisa de inmediato, **sin enviar nada**: aparece el mensaje de la prevalidación del cajón para el tipo, **Solo PDF, JPG, PNG o WEBP.**
- Al pulsar **Guardar** no pasa nada: el cajón se queda abierto, no se cierra y no aparece ningún aviso de guardado.
- Los cuatro datos capturados siguen en su sitio: **Descripción del equipo** con `Silla propia`, **Condiciones pactadas** con `Sin adenda`, **Fecha de inicio** en `2026-09-01` y **Cuota mensual (MXN)** con `300`.

5. En el campo de la evidencia pulsa **Quitar archivo**: el nombre del documento de Word desaparece y el aviso se va con él. Vuelve a pulsar **Guardar** y luego no lo cierres todavía.

**Qué debe verse (al quitar el archivo malo):**

- Con el archivo quitado, el mensaje **Solo PDF, JPG, PNG o WEBP.** ya no está y **Guardar** vuelve a responder.
- Los cuatro datos capturados siguen intactos: `Silla propia`, `Sin adenda`, `2026-09-01` y `300` no se borraron al quitar el archivo.

6. Hazlo de nuevo: en **Evidencia o condiciones (opcional)** elige ahora el PDF pesado `acuerdo-equipo-propio-pesado.pdf`.

**Qué debe verse (el tamaño de más):**

- El cajón vuelve a avisar de inmediato, **sin enviar nada**: ahora el mensaje de la prevalidación para el tamaño, **El archivo supera 10 MB.**
- **Guardar** otra vez no dispara nada: no se cierra el cajón y no hay aviso de guardado.
- Los cuatro datos capturados siguen ahí: `Silla propia`, `Sin adenda`, `2026-09-01` y `300`.

7. Pulsa **Quitar archivo**, cierra el cajón con **Cancelar**, recarga la ficha de **Vera Quintero Lira** → **Activos** y vuelve a pulsar **Declarar equipo propio**.

**Qué debe verse:**

- Tras recargar, el renglón **Silla ergonómica** sigue en **Sin cubrir** con su botón **Declarar equipo propio**, y el resumen sigue en **2 sin cubrir**: no se guardó ninguna declaración.
- Al reabrir el cajón, sus campos vuelven vacíos (incluido **Evidencia o condiciones (opcional)**, sin archivo) y la **Cuota mensual (MXN)** llega otra vez precargada con la cuota estándar.

**Qué significa cada cosa que se ve aquí:**

- **Evidencia o condiciones (opcional)**: es el mismo campo del alta del Escenario 4.1; aquí sirve para comprobar qué archivos acepta.
- **Solo PDF, JPG, PNG o WEBP.** y **El archivo supera 10 MB.**: los dos avisos con los que el cajón prevalida el archivo elegido, uno por tipo y otro por tamaño; salen en cuanto se elige el archivo, sin esperar al envío, y mientras el archivo siga puesto **Guardar** no manda nada. El rechazo del servidor trae otro título y otros textos (Escenario 5.1).
- **Guardar** que no dispara nada: con un archivo que no se acepta, el alta no se manda ni se guarda; la declaración no nace.
- **Quitar archivo**: saca el archivo equivocado del campo sin tocar lo demás; es el camino para corregir y seguir capturando.
- **Obligatorio: este colaborador está en el listado de teletrabajadores (NOM-037 5.7, LFT 330-E)**: la leyenda de la tarjeta cuando la persona teletrabaja el 40% o más, así que su registro sí es exigible.

### 4.7 Con la cuenta que no administra suministros, no aparece el campo de archivo

Objetivo: comprobar que con una cuenta que puede ver la matriz —con sus declaraciones, sus chips de evidencia y el botón de descarga— pero no administrar los suministros del colaborador, no aparece ninguna acción de escritura ni el campo de archivo.

1. Cierra la sesión y entra con el **Usuario B** (`qa-own-equipment-readonly@gsti-tests.local`). Elige la empresa **QA Fundadora**.
2. Abre la ficha de **Ulises Pardo Gil** (`QA-TEL-02`) y entra a **Activos**.
3. Deja cargar la tarjeta **Insumos de teletrabajo** y revisa sus tres renglones y su histórico.

**Qué debe verse:**

- El renglón **Silla ergonómica** en **Equipo propio declarado**, con la versión vigente (**Silla ergonomica de casa**, **Desde el 01/12/2026**, **$420.00 al mes**, chip **Cuota ajustada**) marcada **Sin evidencia**, y debajo el bloque **Declaraciones anteriores (2)** con sus dos renglones cerrados: el del ajuste, con su chip **Con evidencia adjunta** y su botón **Descargar evidencia**, y el del sembrador (**Silla de escritorio anterior**), con el chip **Sin evidencia** y sin botón.
- El renglón **Equipo de cómputo o impresión** en **Equipo propio declarado** con la declaración **Laptop propia** y el chip **Con evidencia adjunta**; el renglón **Aditamento** en **Equipo propio declarado** con la declaración **Monitor propio** y el chip **Sin evidencia**.
- El botón **Descargar evidencia** de esta cuenta **sí** funciona: al pulsarlo baja el archivo, igual que con el Usuario A.
- **Negativo a comprobar a propósito:** en ningún renglón están **Declarar equipo propio**, **Ajustar cuota** ni **Terminar declaración**, y ningún cajón se puede abrir con un campo **Evidencia o condiciones (opcional)**: la cuenta ve la evidencia y la baja, pero no puede escribir ni adjuntar. Las acciones no aparecen deshabilitadas, ni grises, ni con candado: simplemente no están.

**Qué significa lo nuevo aquí:**

- Que falten las acciones y el campo de archivo no es un fallo de la pantalla: a esta cuenta le falta el permiso con el que se administran los suministros del colaborador, así que la matriz se ve entera —con sus declaraciones, su evidencia y su histórico— pero no ofrece escribir. La falta del permiso no se avisa en pantalla: las acciones no se pintan.
- Que el botón **Descargar evidencia** sí se vea: bajar la evidencia es lectura, así que la cuenta que solo lee la conserva. Esta cuenta **sí** mantiene el permiso de **lectura** de **Activos e insumos** —por eso ve los renglones, los chips de evidencia y el botón de descarga—; lo que no tiene es el permiso de **escritura** de los suministros del colaborador. Una cuenta a la que le falte el permiso de **lectura** no vería siquiera la sección, y ese caso no se recorre a pie: vive en el escenario del rechazo por permiso de la §5 (Escenario 5.4).

### 4.8 Anchos de pantalla

Objetivo: comprobar que el renglón con su declaración y su evidencia, el histórico y el cajón se adaptan a un teléfono (360 px), a un ancho intermedio (unos 850 px) y a escritorio, sin apretar la descripción ni el chip de la evidencia y sin provocar desplazamiento horizontal.

1. Con el Usuario A, abre la ficha de **Ulises Pardo Gil** (`QA-TEL-02`) y entra a **Activos**: tras los Escenarios 4.1 a 4.5, la silla está **Equipo propio declarado** con su histórico, el cómputo lleva **Con evidencia adjunta** y el aditamento **Sin evidencia**.
2. Estrecha la ventana del navegador a unos **360 px** de ancho (o usa el modo de dispositivo móvil).
3. La página **no se desplaza en horizontal**: no hay barra inferior de desplazamiento y el contenido de la tarjeta no se sale hacia los lados.
4. Cada renglón queda **apilado en una sola columna**, de arriba abajo: primero el rótulo de la categoría, después su chip de estado y al final lo que la cubre (los activos, o la declaración con su cuota, su chip de evidencia y su botón **Descargar evidencia**), cada cosa en su propio renglón. El texto no se encabalga ni se parte en dos columnas.
5. Despliega **Declaraciones anteriores** en el renglón de la silla: cada versión cerrada ocupa **su propio renglón en una sola columna** (descripción arriba y, debajo, su cuota, su periodo, su motivo y su chip de evidencia con su botón), sin partirse en dos columnas.
6. Abre un cajón del alta: entra a la ficha de **Vera Quintero Lira** (`QA-TEL-03`) → **Activos** → **Declarar equipo propio** en el renglón **Silla ergonómica**. El cajón ocupa **todo el ancho de la pantalla** y sus botones **Cancelar** y **Guardar** van apilados a lo ancho, uno debajo del otro, con el campo **Evidencia o condiciones (opcional)** a todo lo ancho. Ciérralo con **Cancelar**.
7. Vuelve a la ficha de **Ulises Pardo Gil** y ensancha la ventana a un ancho intermedio, **entre tableta y escritorio** (unos **850 px**): el renglón **sigue apilado en una sola columna** (el chip de estado viaja junto al rótulo) y la declaración, con su chip de evidencia, se sigue leyendo en una sola columna. Es a propósito: entre tableta y escritorio la ficha deja al bloque un carril angosto.
8. Pon la ventana a **ancho de escritorio** (desde unos **1024 px**), en esa misma ficha: ahí sí el renglón se abre —el rótulo de la categoría a la izquierda y el chip de estado al extremo derecho— y la declaración, su chip de evidencia, su botón de descarga y su histórico quedan debajo, a todo lo ancho del renglón, sin desbordarse.

**Qué debe verse:**

- A 360 px: sin desplazamiento horizontal, los renglones en una sola columna, el histórico versión por versión en una columna y el cajón a todo lo ancho con el campo **Evidencia o condiciones (opcional)** a todo lo ancho y los botones apilados.
- A unos 850 px: los renglones **siguen** en una sola columna, con el chip de estado junto al rótulo.
- Desde unos 1024 px: el renglón se abre con el rótulo a la izquierda y el chip de estado al extremo derecho, y la declaración, su evidencia y su histórico quedan debajo a todo lo ancho.

**Qué significa lo nuevo aquí:**

- **Que a 850 px los renglones sigan en una columna**: dentro de la ficha el bloque vive en un carril más angosto que la ventana; con dos columnas el rótulo y los datos se apretarían, así que el renglón solo se abre cuando la ventana es de escritorio.
- **Que el cajón ocupe todo el ancho en el teléfono**: en un panel lateral angosto la fecha, la cuota y el archivo no caben sin apretarse.

## 5. Escenarios que resuelven las pruebas automatizadas

Estos no se recorren a mano: el ambiente o el producto no pueden provocarlos desde la pantalla. Se dejaron a las pruebas automatizadas de la historia; cada uno se marca contra su objetivo.

### 5.1 El rechazo del archivo por tipo, tamaño y contenido real

Objetivo: comprobar que el servidor rechaza la evidencia por tres motivos —un tipo que no se acepta, un tamaño que pasa del límite y un archivo que dice ser PDF pero por dentro no lo es—, sin dejar la declaración guardada.

**Qué debe verse:** los tres envíos se rechazan con el título **Archivo no aceptado**: los dos primeros —un tipo que no se acepta y un tamaño que pasa del límite— con **Solo se aceptan archivos PDF, JPG, JPEG, PNG, WEBP.** y **El archivo supera el tamaño máximo de 10 MB.**, y el tercero —un archivo que dice ser PDF pero por dentro no lo es— con el mismo rechazo; en ninguno se guarda la declaración y la categoría sigue **Sin cubrir**.

**Qué pasó:** desde la pantalla solo se pueden provocar los dos primeros (Escenario 4.6); el tercero —un documento de Word al que se le cambia la extensión a PDF— no lo distingue el selector de archivo del cajón y nadie debería renombrar extensiones para probarlo. Lo cubre la prueba automatizada del archivo de la evidencia, que manda un tipo que no se acepta, un archivo que pasa del tamaño máximo y un documento de Word con la extensión cambiada a PDF, y comprueba en los tres el mismo rechazo y que no nace ninguna declaración.

### 5.2 La falla del almacenamiento

Objetivo: comprobar que si el guardado del archivo falla, la declaración no queda guardada a medias.

**Qué debe verse:** la declaración no se guarda y el cajón se queda abierto con el aviso del sistema para un error del servidor —**Archivo no almacenado**, con el detalle **No fue posible guardar el archivo. Vuelve a intentarlo.**—; la categoría se queda en **Sin cubrir** y no aparece ninguna declaración nueva ni un chip de evidencia suelto.

**Qué pasó:** no se puede provocar a mano: para que el almacenamiento falle hay que romper el guardado de archivos por dentro, cosa que la pantalla no expone. Lo cubre la prueba automatizada de la falla del almacenamiento, que hace fallar el guardado del archivo y comprueba que la declaración no se crea, que no queda un archivo huérfano y que la categoría sigue **Sin cubrir**.

### 5.3 El «no encontrado» único de la evidencia

Objetivo: comprobar que la descarga de la evidencia no deja averiguar qué existe: una evidencia que no existe, la de otra empresa y la de una declaración sin archivo responden lo mismo.

**Qué debe verse:** los tres casos devuelven el mismo aviso, con el mismo título y el mismo texto —**Archivo no encontrado**, con el detalle **El archivo no existe o no está disponible.**—, sin ninguna pista de cuál de los tres es; y en ninguno se entrega archivo.

**Qué pasó:** desde el navegador no se puede pedir la evidencia de otra empresa ni la de una declaración que no tenga archivo: el botón **Descargar evidencia** solo aparece donde hay algo que bajar (Escenarios 4.1 y 4.3). Lo cubre la prueba automatizada del aislamiento de la evidencia, que manda los tres casos —una inexistente, una de otra empresa y una de una declaración sin archivo— y compara las respuestas completas entre sí.

### 5.4 El rechazo de la descarga sin permiso

Objetivo: comprobar que el rechazo por falta de permiso para bajar la evidencia lo hace el servidor y no solo la pantalla.

**Qué debe verse:** la descarga se rechaza con el aviso del sistema para una operación sin permiso —**Sin permiso** con **No tienes permiso para realizar esta operación.**—; la evidencia no se entrega.

**Qué pasó:** desde el navegador no se puede provocar: a la cuenta que le falta el permiso para bajar la evidencia la pantalla no le pinta el botón **Descargar evidencia**, así que no hay nada que pulsar (el Escenario 4.7 muestra la cuenta que sí lo ve porque leer la evidencia le basta para bajarla). Lo cubre la prueba automatizada del permiso de la descarga, que con una cuenta sin ese permiso comprueba el rechazo y que las cuentas con permiso sí bajan el archivo.

### 5.5 El ajuste que ignora un archivo enviado en el cuerpo

Objetivo: comprobar que el ajuste nunca toma en cuenta un archivo que viaje junto con la captura: la versión nueva nace **Sin evidencia** aunque en la petición vaya un archivo, y la evidencia de la versión cerrada no se toca.

**Qué debe verse:** el ajuste se guarda (**Declaración ajustada.**) pero la versión nueva queda **Sin evidencia** —sin botón de descarga— y la versión cerrada conserva su chip **Con evidencia adjunta** con su botón; el archivo que viajó con la captura no se guarda en ninguna de las dos.

**Qué pasó:** desde la pantalla no se puede provocar: el cajón del ajuste no tiene campo de archivo (Escenario 4.2), así que no hay forma de mandar uno desde el navegador. Lo cubre la prueba automatizada del ajuste con archivo, que manda un archivo junto con la captura del ajuste y comprueba que la versión nueva queda sin evidencia, que la cerrada conserva la suya y que el archivo enviado no se guarda.

### 5.6 El bloque y el cajón en inglés

Objetivo: comprobar que el bloque de la matriz, la declaración con su evidencia, su histórico y el cajón tienen sus textos en inglés.

**Qué debe verse:** con el idioma en inglés, la matriz se titula **Telework supplies**; la leyenda del registro preventivo dice **Preventive record: not on the teleworkers list**; las categorías se leen **Ergonomic chair**, **Computing or printing equipment** y **Accessory**; los estados de la categoría, **Own equipment declared**, **Uncovered**, **Delivered**, **In transit** y **Not delivered**; y la acción es **Declare own equipment**. La declaración vigente se lee **Since 01/11/2026** y **$350.00 per month**, con el chip **Standard fee** o **Adjusted fee**, y el chip de su evidencia **Evidence attached** o **No evidence**, con su botón **Download evidence**. El histórico se titula **Previous declarations ({n})**, con el periodo **{start} to {end}**, el motivo **Fee adjustment** y el chip **Evidence attached** con su botón **Download evidence** en el renglón que conserva su archivo. El cajón se titula **Declare own equipment: Ergonomic chair** / **Adjust declaration: …** / **Close declaration: …**, con los campos **Equipment description**, **Agreed conditions**, **Start date**, **Monthly fee (MXN)** y **Evidence or terms (optional)**, la ayuda **PDF, JPG, PNG or WEBP up to 10 MB.**, el botón **Remove file**, la nota del ajuste **The new version starts without evidence or addendum backing** y los botones **Cancel** y **Save**; los avisos son **Declaration saved.**, **Declaration adjusted.** y **Declaration closed.** La prevalidación del cajón también sale en inglés: por tipo, **Only PDF, JPG, PNG or WEBP.**, y por tamaño, **The file exceeds 10 MB.** **Negativo a comprobar a propósito:** ningún texto del bloque ni del cajón se queda en español.

**Qué pasó:** no se puede recorrer a pie: el backoffice fuerza el idioma español y oculta los selectores de idioma, así que desde la pantalla no hay forma de poner la interfaz en inglés (por eso este escenario no está en la sección 4, entre los que sí se recorren). Lo cubre la prueba automatizada del idioma, que cambia el idioma del backoffice y comprueba que el bloque, la declaración con su evidencia, el histórico y el cajón se leen en inglés —incluidos los dos avisos del archivo— sin textos en español.

**Checklist de los escenarios automatizados** (una casilla por escenario: se marca si su prueba pasó):

- [x] 5.1 El archivo se rechaza por tipo, por tamaño y por contenido real, y no nace la declaración
- [x] 5.2 Si falla el almacenamiento, la declaración no se guarda ni queda un archivo suelto
- [x] 5.3 La evidencia inexistente, la de otra empresa y la de una declaración sin archivo responden el mismo «no encontrado»
- [x] 5.4 Sin el permiso de descarga el servidor rechaza la bajada, y las cuentas con permiso sí bajan el archivo
- [x] 5.5 El ajuste ignora el archivo enviado en el cuerpo: la versión nueva nace sin evidencia y la cerrada conserva la suya
- [x] 5.6 En inglés el bloque se titula **Telework supplies**, la evidencia se lee **Evidence attached** / **No evidence** con su botón **Download evidence**, el cajón trae **Evidence or terms (optional)** y **Remove file** y los avisos **Declaration saved.** / **Declaration adjusted.** / **Declaration closed.**, sin textos en español

## 6. Checklist del recorrido manual

Cada casilla se marca **contra el objetivo de su escenario**, no contra «se hicieron los pasos»:

- [x] 4.1 En la ficha de `QA-TEL-02`, declarar la silla adjuntando `acuerdo-equipo-propio.pdf` la deja en **Equipo propio declarado** con el chip **Con evidencia adjunta** y su botón **Descargar evidencia**, que baja el mismo PDF, y el resumen pasa de **2 sin cubrir** a **1 sin cubrir**
- [x] 4.2 Ajustar la silla a `420` deja la versión nueva **Sin evidencia** (sin botón) y manda la anterior a **Declaraciones anteriores (2)** —con la del sembrador— con periodo **01/11/2026 a 30/11/2026**, motivo **Ajuste de cuota** y su chip **Con evidencia adjunta** con su botón
- [x] 4.3 La evidencia de la versión cerrada se baja desde el histórico (**Descargar evidencia** en **Declaraciones anteriores**) y es el mismo archivo, aunque la vigente ya no la tenga
- [x] 4.4 Adjuntar una foto del celular deja el cómputo **Con evidencia adjunta** con el resumen en **Completo**, y la foto descargada ya no trae la ubicación con la que se tomó
- [x] 4.5 Declarar el aditamento sin archivo lo deja **Sin evidencia** y sin botón de descarga, sin que el alta falle
- [x] 4.6 Con `QA-TEL-03`, el `.docx` y el PDF de 11 MB se rechazan en el cajón con los avisos de la prevalidación —**Solo PDF, JPG, PNG o WEBP.** para el tipo y **El archivo supera 10 MB.** para el tamaño—, **Guardar** no dispara nada mientras el archivo siga puesto, y **Quitar archivo** lo saca sin perder descripción, fecha ni cuota
- [x] 4.7 Con el Usuario B se ven las declaraciones, sus chips de evidencia y el botón **Descargar evidencia** —que funciona—, y no aparecen **Declarar equipo propio**, **Ajustar cuota**, **Terminar declaración** ni el campo **Evidencia o condiciones (opcional)**
- [x] 4.8 A 360 px no hay desplazamiento horizontal, el histórico y la evidencia van en una columna y el cajón queda a todo lo ancho con los botones apilados; a unos 850 px los renglones siguen en una columna; desde unos 1024 px el renglón se abre con el chip de estado al extremo derecho y la declaración y su histórico debajo a todo lo ancho

## Hallazgos de otras historias

Ninguno.
