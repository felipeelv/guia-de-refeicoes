import { Link, useLocation, useNavigate } from "react-router-dom";
import { PERSONS } from "../catalog/persons.ts";
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
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  function switchTo(key: string) {
    const rest = pathname.replace(/^\/[^/]+/, "");
    navigate(`/${key}${rest}${search}`, { replace: true });
  }
  return (
    <div className="sticky top-0 z-20 border-b border-guide-line bg-guide-paper/92 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-2.5">
        <Link
          to={`/${person.key}`}
          className="min-w-0 truncate font-display text-base font-medium whitespace-nowrap text-guide-ink no-underline"
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
              {PERSONS.map((option) => (
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
    </div>
  );
}
