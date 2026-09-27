import type {
  DayPlanSnapshot,
  Diagnostic,
  DietPlan,
  LogEntryV2,
  PlanActivation,
  ProfileDayState,
  ProfileStoreV2,
} from "../domain/types.ts";
import { saoPauloCalendarDate, shiftIsoDate } from "./profile-store.ts";

export interface PlanActivationResult {
  profile: ProfileStoreV2;
  confirmed: boolean;
  immediate: boolean;
  effectiveDate: string | null;
  activation: PlanActivation | null;
  diagnostics: readonly Diagnostic[];
}

function diagnostic(code: string, message: string): Diagnostic {
  return { code, message };
}

function unchanged(
  profile: ProfileStoreV2,
  code: string,
  message: string,
): PlanActivationResult {
  return {
    profile,
    confirmed: false,
    immediate: false,
    effectiveDate: null,
    activation: null,
    diagnostics: [diagnostic(code, message)],
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function makeDaySnapshot(
  plan: DietPlan,
  date: string,
  frozenAt: string | null,
): DayPlanSnapshot {
  return {
    personKey: plan.personKey,
    date,
    plan: clone(plan),
    baseDaily: clone(plan.daily),
    baseMeals: clone(plan.meals),
    frozenAt,
  };
}

export function dayState(profile: ProfileStoreV2, date: string): ProfileDayState | null {
  return profile.days.find((day) => day.date === date) ?? null;
}

export function dayHasConsumption(profile: ProfileStoreV2, date: string): boolean {
  return (dayState(profile, date)?.entries.length ?? 0) > 0;
}

/**
 * Vigência pela data de calendário. Status superseded continua valendo
 * no intervalo em que era o plano efetivo. Cancelled não entra.
 */
export function effectiveActivation(
  profile: ProfileStoreV2,
  date: string,
): PlanActivation | null {
  const candidates = profile.activations.filter((activation) => {
    if (activation.status === "cancelled") return false;
    if (activation.effectiveDate > date) return false;
    return (
      activation.status === "active" ||
      activation.status === "scheduled" ||
      activation.status === "superseded"
    );
  });
  const order = new Map(profile.activations.map((activation, index) => [activation.id, index]));
  candidates.sort((left, right) => {
    if (left.effectiveDate !== right.effectiveDate) {
      return left.effectiveDate < right.effectiveDate ? 1 : -1;
    }
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? 1 : -1;
    }
    return (order.get(left.id) ?? 0) < (order.get(right.id) ?? 0) ? 1 : -1;
  });
  return candidates[0] ?? null;
}

export function effectivePlan(profile: ProfileStoreV2, date: string): DietPlan | null {
  const activation = effectiveActivation(profile, date);
  if (!activation) return null;
  return profile.plans.find((plan) => plan.id === activation.planId) ?? null;
}

function withDays(
  profile: ProfileStoreV2,
  date: string,
  nextDay: ProfileDayState | null,
): ProfileStoreV2 {
  const days = profile.days.filter((day) => day.date !== date);
  if (nextDay) days.push(nextDay);
  days.sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0));
  return { ...profile, days };
}

function snapshotForOpenDay(
  profile: ProfileStoreV2,
  date: string,
  current: ProfileDayState | null,
): DayPlanSnapshot | null {
  if ((current?.entries.length ?? 0) > 0) return current?.snapshot ?? null;
  const plan = effectivePlan(profile, date);
  if (!plan) return current?.snapshot ?? null;
  return makeDaySnapshot(plan, date, null);
}

/**
 * Proposta sem confirmação não altera o plano ativo.
 * Cancelar ou falhar antes de confirmPlanActivation deixa o perfil como está.
 */
export function discardUnconfirmedProposal(profile: ProfileStoreV2): PlanActivationResult {
  return {
    profile,
    confirmed: false,
    immediate: false,
    effectiveDate: null,
    activation: null,
    diagnostics: [
      diagnostic(
        "proposal_discarded",
        "A proposta não foi aplicada. O plano ativo permanece.",
      ),
    ],
  };
}

export function confirmPlanActivation(
  profile: ProfileStoreV2,
  planId: string,
  now: Date,
  activationId: string,
): PlanActivationResult {
  if (Number.isNaN(now.getTime())) {
    return unchanged(profile, "invalid_instant", "Instante inválido. O plano ativo permanece.");
  }
  const plan = profile.plans.find((item) => item.id === planId);
  if (!plan || plan.personKey !== profile.personKey) {
    return unchanged(profile, "plan_not_found", "Plano não encontrado. O plano ativo permanece.");
  }
  if (profile.activations.some((activation) => activation.id === activationId)) {
    return unchanged(profile, "activation_id_reused", "Esta ativação já existe. Nada foi substituído.");
  }

  const today = saoPauloCalendarDate(now);
  const consumedToday = dayHasConsumption(profile, today);
  const immediate = !consumedToday;
  const effectiveDate = immediate ? today : shiftIsoDate(today, 1);
  const createdAt = now.toISOString();
  const activation: PlanActivation = {
    id: activationId,
    personKey: profile.personKey,
    planId,
    effectiveDate,
    status: immediate ? "active" : "scheduled",
    createdAt,
  };

  const activations = profile.activations.map((current) => {
    if (immediate && (current.status === "active" || current.status === "scheduled")) {
      return { ...current, status: "superseded" as const };
    }
    if (
      !immediate &&
      current.status === "scheduled" &&
      current.effectiveDate >= effectiveDate
    ) {
      return { ...current, status: "superseded" as const };
    }
    return current;
  });

  let next: ProfileStoreV2 = { ...profile, activations: [...activations, activation] };
  const currentDay = dayState(next, today);
  if (!consumedToday) {
    const openSnapshot = snapshotForOpenDay(next, today, currentDay);
    next = withDays(next, today, {
      date: today,
      entries: currentDay?.entries ?? [],
      snapshot: openSnapshot,
    });
  }

  return {
    profile: next,
    confirmed: true,
    immediate,
    effectiveDate,
    activation,
    diagnostics: [
      immediate
        ? diagnostic("activated_today", `Plano em vigor em ${effectiveDate}.`)
        : diagnostic(
            "scheduled_next_day",
            `O dia já tem consumo. O plano passa a valer em ${effectiveDate}.`,
          ),
    ],
  };
}

export function cancelScheduledActivation(
  profile: ProfileStoreV2,
  activationId: string,
  now: Date,
): PlanActivationResult {
  if (Number.isNaN(now.getTime())) {
    return unchanged(profile, "invalid_instant", "Instante inválido. O plano ativo permanece.");
  }
  const activation = profile.activations.find((item) => item.id === activationId);
  if (!activation) {
    return unchanged(profile, "activation_not_found", "Ativação não encontrada. O plano ativo permanece.");
  }
  const today = saoPauloCalendarDate(now);
  if (activation.status !== "scheduled" || activation.effectiveDate <= today) {
    return unchanged(
      profile,
      "schedule_already_started",
      "Só é possível cancelar uma proposta agendada antes do início. O plano ativo permanece.",
    );
  }
  const activeBefore = profile.activations.find((item) => item.status === "active") ?? null;
  const activations = profile.activations.map((item) =>
    item.id === activationId ? { ...item, status: "cancelled" as const } : item,
  );
  const next = { ...profile, activations };
  const activeAfter = next.activations.find((item) => item.status === "active") ?? null;
  if (activeBefore?.id !== activeAfter?.id || activeBefore?.planId !== activeAfter?.planId) {
    return unchanged(profile, "active_plan_protected", "O cancelamento não altera o plano ativo.");
  }
  return {
    profile: next,
    confirmed: false,
    immediate: false,
    effectiveDate: activation.effectiveDate,
    activation: activations.find((item) => item.id === activationId) ?? null,
    diagnostics: [
      diagnostic("schedule_cancelled", "A proposta agendada foi cancelada. O plano ativo permanece."),
    ],
  };
}

/**
 * Restaurar usa as mesmas regras de uma confirmação nova.
 * Não reescreve dias já congelados.
 */
export function restorePlanActivation(
  profile: ProfileStoreV2,
  planId: string,
  now: Date,
  activationId: string,
): PlanActivationResult {
  const frozenPast = profile.days
    .filter((day) => day.snapshot?.frozenAt)
    .map((day) => ({
      date: day.date,
      planId: day.snapshot?.plan.id ?? null,
      frozenAt: day.snapshot?.frozenAt ?? null,
      baseDaily: day.snapshot?.baseDaily ?? null,
    }));
  const result = confirmPlanActivation(profile, planId, now, activationId);
  if (!result.confirmed) return result;
  const rewritten = result.profile.days.some((day) => {
    const previous = frozenPast.find((item) => item.date === day.date);
    if (!previous?.frozenAt || !day.snapshot?.frozenAt) return false;
    return (
      day.snapshot.plan.id !== previous.planId ||
      day.snapshot.frozenAt !== previous.frozenAt ||
      JSON.stringify(day.snapshot.baseDaily) !== JSON.stringify(previous.baseDaily)
    );
  });
  if (rewritten) {
    return unchanged(profile, "past_protected", "A restauração não reescreve um dia já congelado.");
  }
  return {
    ...result,
    diagnostics: [
      diagnostic("plan_restored", "A restauração criou uma nova vigência, sem reescrever o passado."),
      ...result.diagnostics,
    ],
  };
}

/**
 * O primeiro consumo congela a cópia do dia. Antes disso, uma ativação
 * imediata pode atualizar essa cópia. Remover o último lançamento de hoje
 * reabre o dia; um dia passado congelado não é reescrito.
 */
export function applyDayEntries(
  profile: ProfileStoreV2,
  date: string,
  entries: readonly LogEntryV2[],
  now: Date,
): ProfileStoreV2 {
  const today = saoPauloCalendarDate(now);
  const current = dayState(profile, date);
  const dayEntries = entries.filter((entry) => entry.date === date);
  if (dayEntries.length === 0) {
    if (date < today && current?.snapshot?.frozenAt) {
      return withDays(profile, date, { ...current, entries: [] });
    }
    const plan = effectivePlan(profile, date);
    return withDays(profile, date, {
      date,
      entries: [],
      snapshot: plan ? makeDaySnapshot(plan, date, null) : (current?.snapshot ?? null),
    });
  }

  if (current?.snapshot?.frozenAt) {
    return withDays(profile, date, {
      date,
      entries: dayEntries,
      snapshot: current.snapshot,
    });
  }

  const snapshot = current?.snapshot ?? (() => {
    const plan = effectivePlan(profile, date);
    return plan ? makeDaySnapshot(plan, date, null) : null;
  })();
  if (!snapshot) {
    return withDays(profile, date, { date, entries: dayEntries, snapshot: null });
  }
  return withDays(profile, date, {
    date,
    entries: dayEntries,
    snapshot: { ...snapshot, frozenAt: now.toISOString() },
  });
}
