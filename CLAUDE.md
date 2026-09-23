@AGENTS.md

# Paneles con layout compartido (hoy app/(funcionario)/** y app/(apoderado)/**)

Cada grupo tiene su propio `layout.tsx`, pero ambos siguen el mismo
patrón — cualquier panel nuevo con sidebar + bottom nav debe replicarlo:

- Root en columna flex `h-dvh w-full overflow-hidden overscroll-none ...
  lg:flex-row` (no `fixed inset-0`: combinado con `viewportFit: "cover"`
  — que por eso tampoco se usa en `app/layout.tsx` — `fixed` producía un
  bug de ancho en Safari iOS, el panel medía ~70% del ancho real con un
  hueco en blanco a la derecha). `overflow-hidden` en el root evita que
  el documento tenga algo que desplazar durante el colapso de la barra
  de Safari, sin depender de `position: fixed`.
- `<LockScroll />` (`components/lock-scroll.tsx`, compartido) fija
  `html`/`body` con `overflow: hidden` + `position: fixed` mientras el
  panel está montado, como respaldo duro contra el rebote/scroll de
  Safari iOS — se restaura al desmontar, así que no afecta `/login` ni
  otras rutas fuera de estos grupos.
- El bottom nav (`bottom-nav.tsx` de cada grupo, generado desde el
  `nav-items.ts` local + un ítem "Salir" fijo) vive en el flujo normal
  como último hijo del root (no `fixed` él mismo), así que nunca tapa
  contenido y no hace falta ningún `pb-*` de compensación.
- El scroll vive únicamente en el contenedor interno con
  `overflow-y-auto overscroll-contain`. Ninguna página nueva dentro de
  estos grupos debe usar `h-screen`, `min-h-screen` ni `h-dvh` en su
  contenido — el contenido fluye con alto natural dentro de ese
  contenedor.
- El sidebar de desktop usa `hidden lg:flex` (mismo breakpoint que
  `lg:flex-row`/`lg:hidden` del bottom nav).
