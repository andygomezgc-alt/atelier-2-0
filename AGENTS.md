## Criterio de producto: experiencia del chef

Preferencia explícita del usuario, aplicable a todos los cambios:

- Atelier es una herramienta para chefs y su equipo, dentro y fuera de la cocina, con prioridad al uso durante el trabajo en cocina. No convertirla en un software complejo de gestión de cocina.
- Cada mejora debe ahorrar tiempo, reducir esfuerzo o evitar un problema real. Valorar su beneficio frente a los pasos, decisiones y mantenimiento que añade; menos puede ser más.
- Priorizar flujos rápidos, controles claros y pocas interrupciones. Integrar mejoras en las pantallas existentes cuando resulte natural; mantener funciones secundarias fuera del recorrido habitual.
- Automatizar tareas fiables sin exigir que el chef administre versiones, resúmenes o configuraciones. Hacer comprensible el resultado y facilitar corregir o recuperar cambios.
- Evitar formularios largos, avisos constantes, nuevas pantallas y opciones sin una necesidad concreta. No añadir funciones solo porque sean técnicamente posibles.
- Para historial y memoria, empezar por recuperación sencilla de recetas y preferencias pequeñas, opcionales y editables. Posponer comparaciones avanzadas, historial económico y sugerencias automáticas hasta demostrar su utilidad.
- Mantener bajo el consumo de IA: usar reglas para guardado, historial y costes; enviar solo el contexto culinario necesario. La personalización debe apoyar la creatividad sin añadir trabajo al usuario.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
