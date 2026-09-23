import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCatalog } from "../catalog/context.tsx";
import type { Person } from "../domain/types.ts";

function PersonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function PersonBar({ person }: { person: Person }) {
  const { persons } = useCatalog();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const onDiary = pathname.endsWith("/diario");
  function switchTo(key: string) {
    const rest = pathname.replace(/^\/[^/]+/, "");
    navigate(`/${key}${rest}${search}`, { replace: true });
  }
  return (
    <div className="sticky top-0 z-20 border-b border-white/50 bg-guide-paper/80 shadow-[0_1px_10px_rgb(31_26_23/0.05)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-2.5">
        <Link
          to={`/${person.key}`}
          className="min-w-0 truncate font-display text-base whitespace-nowrap text-guide-ink no-underline"
        >
          Guia de refeições
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <label className="person-select relative flex min-h-10 items-center gap-1.5 rounded-full border border-guide-line bg-guide-card pr-2 pl-3 text-guide-accent transition-[border-color] duration-150 hover:border-guide-accent/60">
            <span className="sr-only">Pessoa</span>
            <PersonIcon />
            <select
              value={person.key}
              onChange={(event) => switchTo(event.target.value)}
              className="max-w-36 cursor-pointer appearance-none truncate bg-transparent pr-5 font-bold text-guide-ink outline-none"
            >
              {persons.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.name}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2">
              <ChevronIcon />
            </span>
          </label>
        </div>
      </div>
      <nav
        aria-label="Seções"
        className="mx-auto flex w-full max-w-md gap-2 px-4 pb-2.5"
      >
        <Link
          to={`/${person.key}`}
          aria-current={onDiary ? undefined : "page"}
          className={`rounded-full px-3 py-1.5 text-sm font-bold no-underline transition-colors duration-150 ${
            onDiary
              ? "text-guide-muted hover:text-guide-ink"
              : "bg-guide-ink text-white"
          }`}
        >
          Cardápio
        </Link>
        <Link
          to={`/${person.key}/diario`}
          aria-current={onDiary ? "page" : undefined}
          className={`rounded-full px-3 py-1.5 text-sm font-bold no-underline transition-colors duration-150 ${
            onDiary
              ? "bg-guide-ink text-white"
              : "text-guide-muted hover:text-guide-ink"
          }`}
        >
          Diário
        </Link>
      </nav>
    </div>
  );
}
