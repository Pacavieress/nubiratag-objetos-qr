"use client";

import { useState } from "react";

const NUMEROS_BASICO = [1, 2, 3, 4, 5, 6, 7, 8];
const NUMEROS_MEDIO = [1, 2, 3, 4];
const LETRAS = ["A", "B", "C", "D", "E", "F"];
const NIVELES = ["Pre-Kínder", "Kínder", "Básico", "Medio"];
const NIVELES_CON_NUMERO = ["Básico", "Medio"];

type EstudianteFormValues = {
  nombre: string;
  curso: string | null;
};

function parsearCurso(curso: string | null | undefined) {
  if (!curso) return null;
  const texto = curso.trim();

  const conNumero = texto.match(/^(\d+)°?\s*(Básico|Medio)\s*([A-Za-z])?$/i);
  if (conNumero) {
    const [, numero, nivelRaw, letra] = conNumero;
    const nivel = nivelRaw[0].toUpperCase() + nivelRaw.slice(1).toLowerCase();
    return { numero, nivel, letra: letra?.toUpperCase() ?? "" };
  }

  // Pre-Kínder/Kínder no llevan número.
  const sinNumero = texto.match(/^(Pre-Kínder|Kínder)\s*([A-Za-z])?$/i);
  if (sinNumero) {
    const [, nivelRaw, letra] = sinNumero;
    const nivel =
      NIVELES.find((n) => n.toLowerCase() === nivelRaw.toLowerCase()) ??
      nivelRaw;
    return { numero: "1", nivel, letra: letra?.toUpperCase() ?? "" };
  }

  return null;
}

function capitalizarPrimeraLetra(valor: string) {
  // Capitaliza la primera letra de cada palabra (separadas por espacio),
  // sin tocar el resto de lo que el usuario ya escribió en cada una.
  return valor.replace(
    /(^|\s)(\S)/g,
    (_, separador, letra) => separador + letra.toUpperCase()
  );
}

// Primera palabra = nombre, segunda = apellido paterno, el resto = apellido
// materno (puede ser compuesto, ej. "de la Cruz"). Si el texto guardado no
// tiene al menos 2 palabras, las partes que falten quedan vacías — no se
// fuerza nada raro, el usuario completa lo que falte a mano.
function parsearNombre(nombre: string | undefined) {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    nombrePila: partes[0] ?? "",
    apellidoPaterno: partes[1] ?? "",
    apellidoMaterno: partes.slice(2).join(" "),
  };
}

export function EstudianteForm({
  action,
  defaultValues,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaultValues?: EstudianteFormValues;
  submitLabel: string;
}) {
  const nombreParseado = parsearNombre(defaultValues?.nombre);
  const [nombrePila, setNombrePila] = useState(nombreParseado.nombrePila);
  const [apellidoPaterno, setApellidoPaterno] = useState(
    nombreParseado.apellidoPaterno
  );
  const [apellidoMaterno, setApellidoMaterno] = useState(
    nombreParseado.apellidoMaterno
  );
  const nombre = [nombrePila, apellidoPaterno, apellidoMaterno]
    .filter(Boolean)
    .join(" ");

  const parseado = parsearCurso(defaultValues?.curso);

  const [nivel, setNivel] = useState(parseado?.nivel ?? "");
  const [numero, setNumero] = useState(parseado?.numero ?? "1");
  const [letra, setLetra] = useState(parseado?.letra ?? "");
  // Curso guardado que no matchea el formato N° Nivel Letra (texto libre
  // de antes de este cambio): se preserva tal cual hasta que el usuario
  // toque alguno de los selects.
  const [cursoLibre, setCursoLibre] = useState(
    defaultValues?.curso && !parseado ? defaultValues.curso : null
  );

  const numeros = nivel === "Medio" ? NUMEROS_MEDIO : NUMEROS_BASICO;
  const mostrarNumero = NIVELES_CON_NUMERO.includes(nivel);
  const curso =
    cursoLibre ??
    (nivel
      ? mostrarNumero
        ? `${numero}° ${nivel}${letra ? ` ${letra}` : ""}`
        : `${nivel}${letra ? ` ${letra}` : ""}`
      : "");

  function usarSelects() {
    if (cursoLibre !== null) setCursoLibre(null);
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nombrePila" className="text-sm font-medium text-gray-600">
          Nombre
        </label>
        <input
          id="nombrePila"
          required
          value={nombrePila}
          onChange={(e) => setNombrePila(capitalizarPrimeraLetra(e.target.value))}
          className="rounded-lg border border-gray-300 px-4 py-3.5 text-base focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="apellidoPaterno"
          className="text-sm font-medium text-gray-600"
        >
          Apellido paterno
        </label>
        <input
          id="apellidoPaterno"
          required
          value={apellidoPaterno}
          onChange={(e) =>
            setApellidoPaterno(capitalizarPrimeraLetra(e.target.value))
          }
          className="rounded-lg border border-gray-300 px-4 py-3.5 text-base focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="apellidoMaterno"
          className="text-sm font-medium text-gray-600"
        >
          Apellido materno (opcional)
        </label>
        <input
          id="apellidoMaterno"
          value={apellidoMaterno}
          onChange={(e) =>
            setApellidoMaterno(capitalizarPrimeraLetra(e.target.value))
          }
          className="rounded-lg border border-gray-300 px-4 py-3.5 text-base focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
        />
        <input type="hidden" name="nombre" value={nombre} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-gray-600">Curso</span>
        <div className="flex gap-2">
          <select
            aria-label="Nivel"
            required
            value={nivel}
            onChange={(e) => {
              usarSelects();
              setNivel(e.target.value);
              setNumero("1");
              setLetra("");
            }}
            className="rounded-lg border border-gray-300 px-3 py-4 text-lg focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
          >
            <option value="" disabled>
              Selecciona un nivel
            </option>
            {NIVELES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {nivel && (
            <>
              {mostrarNumero && (
                <select
                  aria-label="Número"
                  value={numero}
                  onChange={(e) => {
                    usarSelects();
                    setNumero(e.target.value);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-4 text-lg focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
                >
                  {numeros.map((n) => (
                    <option key={n} value={n}>
                      {n}°
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label="Letra"
                value={letra}
                onChange={(e) => {
                  usarSelects();
                  setLetra(e.target.value);
                }}
                className="rounded-lg border border-gray-300 px-3 py-4 text-lg focus:border-[#54A6D8] focus:outline-none focus:ring-2 focus:ring-[#54A6D8]"
              >
                <option value="">Sin letra</option>
                {LETRAS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <input type="hidden" name="curso" value={curso} />
      </div>
      <button
        type="submit"
        className="w-full rounded-xl bg-[#ff914d] px-5 py-3.5 text-base font-medium text-white transition hover:bg-[#e08044] sm:w-auto"
      >
        {submitLabel}
      </button>
    </form>
  );
}
