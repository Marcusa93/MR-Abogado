# diagnostico · Skill de diagnóstico previo

> Skill reutilizable. Opera independientemente del perfil de área cargado.
> Cargar en cualquier Project junto con (o sin) el CLAUDE.md general.
> Activar explícitamente o configurar para disparo automático según preferencia del abogado.

---

## Función

Analizar cualquier escrito jurídico aportado y entregar un diagnóstico estructurado
antes de modificarlo, ampliarlo o usarlo como base de otro trabajo.

El diagnóstico no modifica el escrito. Solo identifica problemas. La modificación
ocurre en una segunda etapa, después de que el abogado da instrucción de proceder.

---

## Cuándo se activa

**Activación explícita:** el abogado escribe "diagnosticá este escrito" o "corré el diagnóstico"
antes de pegar el texto.

**Activación automática (si está configurada en CLAUDE.md):** ante cualquier escrito
de más de 300 palabras pegado en el chat sin instrucción específica sobre qué hacer con él.

**Activación diferida:** el abogado pega el escrito y da una instrucción de modificación
directa (por ejemplo "mejorá los fundamentos"). El sistema corre el diagnóstico primero
y luego pregunta si procede con la modificación o si el abogado quiere revisar el
diagnóstico antes.

---

## Estructura del diagnóstico

El diagnóstico se entrega en un bloque único con estas secciones, en este orden.
Si una sección no tiene observaciones, escribir "Sin observaciones" y continuar.
No omitir secciones.

---

### 1. Identificación del escrito

- Tipo de escrito (demanda / contestación / recurso / alegato / carta documento / otro)
- Rama del derecho inferida
- Fuero inferido (si es posible determinarlo del texto)
- Parte que lo suscribe (actor / demandado / tercero / indeterminado)

Si alguno de estos datos no puede determinarse del texto, indicarlo y preguntar
antes de continuar con el diagnóstico.

---

### 2. Argumentos sin norma de respaldo

Listar cada afirmación jurídica que no está respaldada por una norma citada en el escrito.

Formato:
```
[ARG SIN NORMA] "texto o paráfrasis del argumento" - norma que correspondería citar: [sugerencia o "indeterminado"]
```

Ejemplos de situaciones a marcar:
- Afirmaciones sobre responsabilidad sin cita del artículo aplicable del CCCN o ley especial
- Invocación de principios generales (buena fe, abuso del derecho) sin cita normativa
- Referencias al "régimen vigente" o "normativa aplicable" sin especificar cuál
- Peticiones de daños sin indicar la norma que habilita cada rubro

---

### 3. Hechos no acreditados

Listar afirmaciones fácticas que el escrito da por probadas pero que no están
respaldadas por prueba ofrecida o producida en el mismo escrito.

Formato:
```
[VACÍO PROBATORIO] descripción del hecho afirmado - prueba que correspondería: [sugerencia o "indeterminado"]
```

Distinguir entre:
- Hechos afirmados sin ninguna referencia probatoria (vacío total)
- Hechos afirmados con referencia a prueba que no se ve en el material aportado
  (vacío parcial - puede estar en otro escrito del expediente)

No marcar como vacío probatorio los hechos que el escrito presenta como objeto
de prueba a producir, si están correctamente diferenciados.

---

### 4. Citas jurisprudenciales no verificadas

Listar toda cita jurisprudencial que figure en el escrito.

Para cada una, indicar:

```
[JURISPRUDENCIA NO VERIFICADA] "carátula / sala / año citados" - verificar antes de presentar
```

Si el material completo del fallo fue aportado por el abogado en la sesión:
```
[JURISPRUDENCIA VERIFICADA EN SESIÓN] "carátula" - doctrina: [resumen]
```

Regla absoluta: no agregar jurisprudencia nueva al escrito sin material aportado.
Si el diagnóstico detecta que el escrito necesita jurisprudencia adicional,
indicarlo con:
```
[JURISPRUDENCIA REQUERIDA] doctrina necesaria: [descripción] - aportar expediente, sala y año
```

---

### 5. Peticiones sin desarrollo en fundamentos

Listar cada petición del escrito que no tiene desarrollo argumental o normativo
en la sección de fundamentos.

Formato:
```
[PETICIÓN SIN FUNDAMENTO] "texto de la petición" - desarrollar en fundamentos: [indicación de qué falta]
```

Situaciones típicas:
- Peticiones de daños en el petitorio sin cuantificación ni norma habilitante
  en los fundamentos
- Solicitudes de medidas cautelares sin acreditación de verosimilitud del derecho
  y peligro en la demora
- Recursos sin indicación precisa del agravio y de la norma que lo habilita
- Costas pedidas sin indicación del principio aplicable

---

### 6. Contradicciones internas

Listar inconsistencias entre distintas partes del escrito.

Formato:
```
[CONTRADICCIÓN] sección A dice: "[paráfrasis]" / sección B dice: "[paráfrasis]" - resolución necesaria: [indicación]
```

Situaciones típicas:
- Fecha de los hechos que no coincide entre la narración y el petitorio
- Monto reclamado que no coincide entre fundamentos y petición
- Calificación jurídica distinta del mismo hecho en distintas secciones
- Argumento que en una sección afirma algo y en otra lo niega implícitamente

---

### 7. Normas con verificación pendiente

Listar todas las normas citadas en el escrito que requieren verificación de vigencia,
según la regla general del CLAUDE.md.

Formato:
```
[VERIFICAR VIGENCIA] norma citada - motivo: [modificada / derogada parcialmente / posible reforma posterior]
```

Si el escrito cita una norma que el sistema tiene certeza que fue derogada o modificada,
indicarlo con la norma vigente propuesta:
```
[NORMA DESACTUALIZADA] norma citada - reemplazar por: [norma vigente] [VERIFICAR VIGENCIA]
```

Si el escrito involucra una acción o recurso sujeto a plazo fatal de caducidad o prescripción,
agregar adicionalmente:
```
[ALERTA PLAZO FATAL: norma - plazo - fecha de inicio del cómputo - vencimiento estimado]
```
Ejemplos de cuándo emitirlo: acción contenciosa administrativa (art. 25 LNPA), amparo
(Ley 16.986 / Ley 2145 CABA), prescripción laboral (art. 258 LCT), prescripción acción
de responsabilidad del Estado (art. 7 Ley 26.944).

---

### 8. Observaciones estructurales

Señalar problemas de estructura que no encajan en las categorías anteriores.

Situaciones a incluir:
- Ausencia de secciones obligatorias según el tipo de escrito y el fuero
  (por ejemplo: demanda sin ofrecimiento de prueba, recurso sin indicación de agravio)
- Orden de argumentos que debilita la posición (por ejemplo: defensa de fondo
  antes de nulidad procesal)
- Extensión manifiestamente desproporcionada para el tipo de escrito
- Argumentos reiterados que deberían unificarse

Formato libre, en prosa. Máximo 5 observaciones.

---

### 9. Síntesis

Párrafo corto (máximo 5 líneas) con:
- Cantidad total de marcadores emitidos por categoría
- Evaluación de si el escrito es presentable con correcciones menores,
  requiere revisión sustancial, o tiene problemas que afectan su viabilidad
- La observación más urgente a resolver antes de proceder

---

## Instrucción de cierre del diagnóstico

Al terminar el diagnóstico, el sistema escribe:

```
Diagnóstico completo. ¿Procedemos con las correcciones, o querés revisar algún punto primero?
```

No hacer modificaciones hasta recibir instrucción. Si el abogado da instrucción
de proceder sobre un escrito con contradicciones internas o peticiones sin fundamento
que afectan la viabilidad, advertirlo antes de modificar.

---

## Integración con perfiles de área

El skill de diagnóstico opera con el conocimiento normativo del perfil de área
que esté cargado en la sesión. Si no hay perfil de área, opera con el CLAUDE.md
general. Si no hay ninguno, opera con conocimiento base del sistema e indica:

```
[SIN PERFIL DE ÁREA CARGADO] el diagnóstico se realizó con conocimiento normativo general.
Cargar el perfil del área correspondiente para un diagnóstico más preciso.
```

---

## Interacción con la regla de integridad

Las reglas de la sección "Reglas de citación" del CLAUDE.md general no pueden
ser suspendidas desde este skill. Si el diagnóstico detecta que el escrito tiene
jurisprudencia citada que el abogado pide verificar sin aportar el material,
el sistema emite el marcador correspondiente y no inventa la verificación.

---

*Última actualización: mayo 2026*
*Autor: Dr. Cristian Aboitiz · [@abogadoaboitiz](https://x.com/abogadoaboitiz)*
