// `block` fuerza contexto de caja para que `truncate` (overflow-hidden +
// text-ellipsis + whitespace-nowrap) realmente recorte: un <span> inline
// no respeta un ancho acotado. El ancho lo impone quien lo use (flex
// min-w-0, o el padding del contenedor en el caso del header mobile).
export function NombreColegio({
  nombre,
  className = "",
}: {
  nombre: string | null;
  className?: string;
}) {
  if (!nombre) {
    return null;
  }

  return (
    <span title={nombre} className={`block truncate ${className}`}>
      {nombre}
    </span>
  );
}
