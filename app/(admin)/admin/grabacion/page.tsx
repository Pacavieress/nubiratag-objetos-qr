import { requireSuperAdmin } from "../colegios/actions";
import { Teleprompter } from "./teleprompter";

export default async function GrabacionPage() {
  await requireSuperAdmin();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-900">Grabación</h1>
      <Teleprompter />
    </main>
  );
}
