interface TeamCardProps {
  name: string;
  /** Left as the literal "[Role]" placeholder where the source copy has no role filled in
   * yet — styled distinctly (muted, italic) so it visually reads as "not filled in", never
   * as a real invented title. */
  role: string;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter((w) => w.length > 0 && /[A-Za-z]/.test(w[0]))
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TeamCard({ name, role }: TeamCardProps) {
  const isPlaceholder = role.trim() === "[Role]";
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 text-lg font-bold text-primary">
        {initials(name)}
      </div>
      <div>
        <p className="text-sm font-bold text-gray-900">{name}</p>
        <p className={`mt-0.5 text-xs ${isPlaceholder ? "italic text-gray-300" : "text-gray-500"}`}>{role}</p>
      </div>
    </div>
  );
}
