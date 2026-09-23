import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useCatalog } from "../catalog/context.tsx";
import {
  consumedByMeal,
  dateKey,
  totalConsumed,
  type LogEntry,
} from "../domain/day-log.ts";
import type { MealKey, Person } from "../domain/types.ts";

const STORAGE_PREFIX = "meal-guide:v1:log:";
const KEEP_DAYS = 7;

function storageKey(personKey: string, day: string): string {
  return `${STORAGE_PREFIX}${personKey}:${day}`;
}

function readEntries(key: string): LogEntry[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is LogEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as LogEntry).id === "string" &&
        typeof (entry as LogEntry).foodId === "string" &&
        Number.isFinite((entry as LogEntry).grams) &&
        (entry as LogEntry).grams > 0 &&
        typeof (entry as LogEntry).mealKey === "string",
    );
  } catch {
    return [];
  }
}

function pruneOldLogs(): void {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
    const cutoffKey = dateKey(cutoff);
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const day = key.slice(key.lastIndexOf(":") + 1);
      if (day < cutoffKey) localStorage.removeItem(key);
    }
  } catch {
    // localStorage indisponível (modo privado, por exemplo): o diário fica só em memória.
  }
}

export interface LogValue {
  entries: LogEntry[];
  addEntry: (input: { foodId: string; grams: number; mealKey: MealKey }) => void;
  removeEntry: (id: string) => void;
  totalKcal: number;
  consumedByMeal: Partial<Record<MealKey, number>>;
}

const LogContext = createContext<LogValue | null>(null);

export function LogProvider({
  person,
  children,
}: {
  person: Person;
  children: ReactNode;
}) {
  const { foods } = useCatalog();
  const key = storageKey(person.key, dateKey());
  const [state, setState] = useState(() => {
    pruneOldLogs();
    return { key, entries: readEntries(key) };
  });
  if (state.key !== key) {
    setState({ key, entries: readEntries(key) });
  }

  useEffect(() => {
    try {
      localStorage.setItem(state.key, JSON.stringify(state.entries));
    } catch {
      // Sem espaço ou sem acesso ao localStorage: mantém só em memória.
    }
  }, [state]);

  const foodsById = useMemo(
    () => new Map(foods.map((food) => [food.id, food])),
    [foods],
  );

  const addEntry = useCallback(
    (input: { foodId: string; grams: number; mealKey: MealKey }) => {
      if (!Number.isFinite(input.grams) || input.grams <= 0) return;
      const entry: LogEntry = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...input,
      };
      setState((current) => ({
        key: current.key,
        entries: [...current.entries, entry],
      }));
    },
    [],
  );

  const removeEntry = useCallback((id: string) => {
    setState((current) => ({
      key: current.key,
      entries: current.entries.filter((entry) => entry.id !== id),
    }));
  }, []);

  const value = useMemo<LogValue>(
    () => ({
      entries: state.entries,
      addEntry,
      removeEntry,
      totalKcal: totalConsumed(state.entries, foodsById),
      consumedByMeal: consumedByMeal(state.entries, foodsById),
    }),
    [state.entries, addEntry, removeEntry, foodsById],
  );

  return <LogContext.Provider value={value}>{children}</LogContext.Provider>;
}

export function useLog(): LogValue {
  const log = useContext(LogContext);
  if (!log) throw new Error("useLog fora do LogProvider.");
  return log;
}

export function useOptionalLog(): LogValue | null {
  return useContext(LogContext);
}
