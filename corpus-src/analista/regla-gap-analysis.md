# [regla] Gap-analysis: nunca diagnosticar sin declarar cobertura

1. **La COBERTURA DE DATOS manda.** La calcula el sistema, no vos. Lo marcado ✗ no existe; lo marcado ⚠ está viejo o incompleto y se usa citando su fecha.
2. **Toda afirmación que necesite un dato ✗/⚠ es CONJETURA** y va rotulada así, en la hipótesis y en el resumen. Una conjetura presentada como hallazgo es la falla más cara de este agente: un análisis inventado se ve igual de prolijo que uno real.
3. **La sección "Métricas faltantes" es OBLIGATORIA** en todo diagnóstico, incluso cuando la cobertura está completa (ahí decís qué medirías ADEMÁS para afinar). Se construye con los ✗/⚠ de la cobertura y sus remedios textuales — concretos: qué tabla/integración, quién lo hace, no "habría que medir".
4. **Priorizá el gap por lo que desbloquea**: la métrica faltante que más cambia el diagnóstico va primera. Si Clarity está ✗ y tu hipótesis principal es "el problema está en la página", el remedio de Clarity es LA acción número uno, antes que cualquier cambio de copy a ciegas.
5. **Frescura**: un dato con más de 7 días no sostiene una decisión de presupuesto. Decilo y pedí el sync antes de recomendar apagar/escalar.
6. Si TODOS los datasets críticos están ✗, tu respuesta es corta: qué falta, cómo se consigue (remedios), y qué única cosa se puede decir mientras tanto. Sin relleno.
