import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCatalog } from "../catalog/context.tsx";
import type { Person } from "../domain/types.ts";

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

function LogoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <circle
        cx="12"
        cy="12"
        r="4.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth={2}
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8.5" fill="currentColor" fillOpacity={0.15} />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function FoodsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 4.5h8l1 3.5H7l1-3.5Z" fill="currentColor" fillOpacity={0.15} />
      <path d="M6.5 8h11l-.8 9.2a2 2 0 0 1-2 1.8H9.3a2 2 0 0 1-2-1.8L6.5 8Z" />
      <path d="M9.5 12.5h5" />
    </svg>
  );
}

function DiaryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect
        x="5"
        y="3.5"
        width="14"
        height="17"
        rx="2.5"
        fill="currentColor"
        fillOpacity={0.15}
      />
      <path d="M9 8.5h6M9 12h6M9 15.5h3.5" />
    </svg>
  );
}

export function PersonBar({ person }: { person: Person }) {
  const { persons } = useCatalog();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  function switchTo(key: string) {
    const rest = pathname.replace(/^\/[^/]+/, "");
    navigate(`/${key}${rest}${search}`, { replace: true });
  }
  return (
    <div className="sticky top-0 z-20 bg-guide-paper/85 backdrop-blur-md">
      <div className="mx-auto flex min-h-13 w-full max-w-md items-center justify-between gap-3 px-5 py-2">
        <label className="person-select relative flex min-h-10 min-w-0 items-center gap-2.5 rounded-card pr-1">
          <span className="sr-only">Pessoa</span>
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-guide-line text-xs font-bold text-guide-accent-ink"
          >
            {person.name.charAt(0)}
          </span>
          <select
            value={person.key}
            onChange={(event) => switchTo(event.target.value)}
            className="max-w-44 cursor-pointer appearance-none truncate bg-transparent pr-5 text-sm text-guide-body outline-none"
          >
            {persons.map((option) => (
              <option key={option.key} value={option.key}>
                {option.name}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-0 text-guide-muted">
            <ChevronIcon />
          </span>
        </label>
        <Link
          to={`/${person.key}`}
          className="flex shrink-0 items-center gap-1.5 text-sm font-medium whitespace-nowrap text-guide-ink no-underline"
        >
          <span className="text-guide-accent">
            <LogoIcon />
          </span>
          Guia de refeições
        </Link>
      </div>
    </div>
  );
}

export function TabBar({ person }: { person: Person }) {
  const { pathname } = useLocation();
  const onDiary = pathname.endsWith("/diario");
  const onFoods = pathname.endsWith("/alimentos");
  const tabs = [
    {
      label: "Cardápio",
      to: `/${person.key}`,
      active: !onDiary && !onFoods,
      icon: <MenuIcon />,
    },
    {
      label: "Alimentos",
      to: `/${person.key}/alimentos`,
      active: onFoods,
      icon: <FoodsIcon />,
    },
    { label: "Diário", to: `/${person.key}/diario`, active: onDiary, icon: <DiaryIcon /> },
  ];
  return (
    <nav
      aria-label="Seções"
      className="fixed inset-x-0 bottom-0 z-30 px-5 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto flex h-16 max-w-md items-stretch justify-around rounded-card bg-guide-card shadow-pop">
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            to={tab.to}
            aria-current={tab.active ? "page" : undefined}
            className={`flex min-w-20 flex-col items-center justify-center gap-0.5 text-[11px] no-underline transition-colors duration-150 ${
              tab.active
                ? "font-bold text-guide-ink [&_svg]:text-guide-accent"
                : "text-guide-muted hover:text-guide-ink"
            }`}
          >
            {tab.icon}
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
