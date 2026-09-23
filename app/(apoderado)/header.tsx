export function Header({ email }: { email: string | null | undefined }) {
  const usuario = email?.split("@")[0];
  const usuarioCapitalizado = usuario
    ? usuario.charAt(0).toUpperCase() + usuario.slice(1)
    : usuario;

  return (
    <header className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-3 print:hidden">
      <p className="text-xl font-bold sm:text-2xl lg:hidden">
        <span className="text-[#2c7bc0]">Nubira</span>
        <span className="text-[#ff914d]">Tag</span>
      </p>
      {usuarioCapitalizado && (
        <span className="ml-auto text-sm font-bold text-gray-600">
          {usuarioCapitalizado}
        </span>
      )}
    </header>
  );
}
