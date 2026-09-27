import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useCatalog } from "../catalog/context.tsx";
import { libraryFoods } from "../catalog/library.ts";
import type {
  DietPlan,
  Food,
  FrozenNutrients,
  LogEntryV2,
  MealKey,
  Person,
  ProfileStoreV2,
} from "../domain/types.ts";
import { validateDietPlan } from "../domain/nutrition/nutrition-validation.ts";
import { browserProfileStorage } from "./browser-storage.ts";
import { buildDayView, type DayView } from "./day-view.ts";
import { CATALOG_VERSION } from "./solver-input.ts";
import { scaleFrozenNutrients } from "./nutrient-display.ts";
import {
  applyDayEntries,
  cancelScheduledActivation,
  confirmPlanActivation,
  restorePlanActivation,
  type PlanActivationResult,
} from "./plan-activation.ts";
import { migrateProfileV1 } from "./migrate-v1.ts";
import {
  emptyProfile,
  loadProfile,
  profileStorageKey,
  retainDiaryDays,
  saoPauloCalendarDate,
  saveProfile,
  UNSAVED_DEVICE_MESSAGE,
} from "./profile-store.ts";
import { migrationFlagKey } from "./migrate-v1.ts";

export interface BatchLogItem {
  food: Food;
  grams: number;
  units: number | null;
  mealKey: MealKey;
  nutrients: FrozenNutrients;
}

export interface DietValue extends DayView {
  personKey: Person["key"];
  profile: ProfileStoreV2;
  today: string;
  notice: string | null;
  latestConfirmedPlan: DietPlan | null;
  scheduledActivation: ProfileStoreV2["activations"][number] | null;
  addManualEntry: (item: BatchLogItem) => boolean;
  addBatch: (items: readonly BatchLogItem[]) => boolean;
  updateEntryGrams: (id: string, grams: number) => boolean;
  removeEntry: (id: string) => boolean;
  confirmProposal: (plan: DietPlan) => { result: PlanActivationResult; persisted: boolean } | null;
  cancelScheduled: (activationId: string) => boolean;
  restorePlan: (planId: string) => { result: PlanActivationResult; persisted: boolean } | null;
  saveLibraryFood: (foodId: string) => boolean;
  removeLibraryFood: (foodId: string) => boolean;
}

const DietContext = createContext<DietValue | null>(null);

function latestConfirmed(profile: ProfileStoreV2): DietPlan | null {
  const confirmed = profile.plans.filter((plan) => plan.origin === "confirmed");
  confirmed.sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
  return confirmed[0] ?? null;
}

function openProfile(person: Person, foods: readonly Food[]): {
  profile: ProfileStoreV2;
  notice: string | null;
} {
  const storage = browserProfileStorage();
  const foodsById = new Map(
    foods.map((food) => [
      food.id,
      {
        name: food.name,
        preparation: food.preparation,
        caloriesPer100g: food.caloriesPer100g,
        proteinPer100g: food.proteinPer100g,
        carbohydratePer100g: food.carbohydratePer100g,
        fatPer100g: food.fatPer100g,
        source: food.source,
      },
    ]),
  );
  const migrated = migrateProfileV1({
    storage,
    personKey: person.key,
    now: new Date(),
    foodsById,
    dailyCalories: person.dailyCalories,
    meals: person.meals.map((meal) => ({
      mealKey: meal.key,
      calories: meal.targetCalories,
    })),
    catalogVersion: CATALOG_VERSION,
  });
  const today = saoPauloCalendarDate(new Date());
  if (migrated.ok && migrated.profile) {
    const retained = retainDiaryDays(migrated.profile, today);
    if (retained.days.length !== migrated.profile.days.length) {
      const saved = saveProfile(storage, retained);
      if (!saved.persisted) return { profile: retained, notice: UNSAVED_DEVICE_MESSAGE };
      return { profile: saved.profile, notice: null };
    }
    return { profile: migrated.profile, notice: null };
  }
  if (migrated.profile) {
    return { profile: migrated.profile, notice: UNSAVED_DEVICE_MESSAGE };
  }
  const loaded = loadProfile(storage, person.key);
  if (loaded.ok) return { profile: loaded.profile, notice: UNSAVED_DEVICE_MESSAGE };
  return { profile: emptyProfile(person.key), notice: UNSAVED_DEVICE_MESSAGE };
}

function toEntry(item: BatchLogItem, person: Person, today: string, batchId: string, dayPlanId: string | null): LogEntryV2 {
  return {
    id: crypto.randomUUID(),
    batchId,
    personKey: person.key,
    date: today,
    mealKey: item.mealKey,
    foodId: item.food.id,
    foodName: item.food.name,
    preparation: item.food.preparation,
    grams: item.grams,
    units: item.units,
    nutrients: item.nutrients,
    source: item.food.source,
    foodVersion: `${item.food.source.code}@${item.food.source.accessedAt}`,
    dayPlanId,
    createdAt: new Date().toISOString(),
  };
}

export function DietProvider({ person, children }: { person: Person; children: ReactNode }) {
  const { foods } = useCatalog();
  const [opened, setOpened] = useState(() => ({
    personKey: person.key,
    ...openProfile(person, foods),
  }));
  const [profile, setProfile] = useState(opened.profile);
  const [notice, setNotice] = useState<string | null>(opened.notice);
  const [today, setToday] = useState(() => saoPauloCalendarDate(new Date()));
  const writing = useRef(false);

  if (opened.personKey !== person.key) {
    const next = { personKey: person.key, ...openProfile(person, foods) };
    setOpened(next);
    setProfile(next.profile);
    setNotice(next.notice);
  }

  useEffect(() => {
    const tick = () => {
      const next = saoPauloCalendarDate(new Date());
      setToday((current) => (current === next ? current : next));
    };
    const id = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, []);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.storageArea && event.storageArea !== localStorage) return;
      const key = profileStorageKey(person.key);
      if (
        event.key !== null &&
        event.key !== key &&
        event.key !== migrationFlagKey(person.key)
      ) {
        return;
      }
      const loaded = loadProfile(browserProfileStorage(), person.key);
      if (!loaded.ok) return;
      setProfile((current) =>
        loaded.profile.revision > current.revision ? loaded.profile : current,
      );
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [person.key]);

  const persist = useCallback((next: ProfileStoreV2): boolean => {
    const saved = saveProfile(browserProfileStorage(), next);
    if (saved.persisted) {
      setNotice(null);
      setProfile(saved.profile);
      return true;
    }
    setNotice(saved.message);
    setProfile(next);
    return false;
  }, []);

  const view = useMemo(
    () => buildDayView(person, profile, today),
    [person, profile, today],
  );

  const writeEntries = useCallback(
    (entries: readonly LogEntryV2[]): boolean => {
      const next = applyDayEntries(profile, today, entries, new Date());
      return persist(retainDiaryDays(next, today));
    },
    [persist, profile, today],
  );

  const addBatch = useCallback(
    (items: readonly BatchLogItem[]): boolean => {
      if (writing.current || items.length === 0) return false;
      if (items.some((item) => !Number.isFinite(item.grams) || item.grams <= 0)) return false;
      writing.current = true;
      try {
        const batchId = crypto.randomUUID();
        const planId = view.effective?.id ?? null;
        const created = items.map((item) => toEntry(item, person, today, batchId, planId));
        return writeEntries([...view.entries, ...created]);
      } finally {
        writing.current = false;
      }
    },
    [person, today, view.effective?.id, view.entries, writeEntries],
  );

  const addManualEntry = useCallback(
    (item: BatchLogItem) => addBatch([item]),
    [addBatch],
  );

  const updateEntryGrams = useCallback(
    (id: string, grams: number): boolean => {
      if (!Number.isFinite(grams) || grams <= 0) return false;
      const entries = view.entries.map((entry) => {
        if (entry.id !== id) return entry;
        return {
          ...entry,
          grams,
          units: entry.units != null && entry.grams > 0 ? (entry.units * grams) / entry.grams : entry.units,
          nutrients: scaleFrozenNutrients(entry.nutrients, entry.grams, grams),
        };
      });
      return writeEntries(entries);
    },
    [view.entries, writeEntries],
  );

  const removeEntry = useCallback(
    (id: string) => writeEntries(view.entries.filter((entry) => entry.id !== id)),
    [view.entries, writeEntries],
  );

  const confirmProposal = useCallback(
    (plan: DietPlan) => {
      if (plan.personKey !== person.key || plan.origin !== "confirmed") return null;
      if (!validateDietPlan(plan).valid) return null;
      const withPlan: ProfileStoreV2 = {
        ...profile,
        plans: [...profile.plans.filter((item) => item.id !== plan.id), plan],
        confirmedAssessment: plan.assessment,
        draftAssessment: plan.assessment,
      };
      const result = confirmPlanActivation(
        withPlan,
        plan.id,
        new Date(),
        crypto.randomUUID(),
      );
      if (!result.confirmed) return { result, persisted: false };
      const persisted = persist(retainDiaryDays(result.profile, today));
      return { result, persisted };
    },
    [persist, person.key, profile, today],
  );

  const cancelScheduled = useCallback(
    (activationId: string) => {
      const result = cancelScheduledActivation(profile, activationId, new Date());
      if (result.activation?.status !== "cancelled") return false;
      return persist(result.profile);
    },
    [persist, profile],
  );

  const saveLibraryFood = useCallback(
    (foodId: string): boolean => {
      if (!libraryFoods.some((food) => food.id === foodId)) return false;
      const current = profile.savedFoodIds ?? [];
      if (current.includes(foodId)) return true;
      return persist({ ...profile, savedFoodIds: [...current, foodId] });
    },
    [persist, profile],
  );

  const removeLibraryFood = useCallback(
    (foodId: string): boolean => {
      const current = profile.savedFoodIds ?? [];
      if (!current.includes(foodId)) return true;
      return persist({
        ...profile,
        savedFoodIds: current.filter((id) => id !== foodId),
      });
    },
    [persist, profile],
  );

  const restorePlan = useCallback(
    (planId: string) => {
      const result = restorePlanActivation(
        profile,
        planId,
        new Date(),
        crypto.randomUUID(),
      );
      if (!result.confirmed) return { result, persisted: false };
      const persisted = persist(retainDiaryDays(result.profile, today));
      return { result, persisted };
    },
    [persist, profile, today],
  );

  const value = useMemo<DietValue>(
    () => ({
      ...view,
      personKey: person.key,
      profile,
      today,
      notice,
      latestConfirmedPlan: latestConfirmed(profile),
      scheduledActivation:
        profile.activations.find((item) => item.status === "scheduled") ?? null,
      addManualEntry,
      addBatch,
      updateEntryGrams,
      removeEntry,
      confirmProposal,
      cancelScheduled,
      restorePlan,
      saveLibraryFood,
      removeLibraryFood,
    }),
    [
      addBatch,
      addManualEntry,
      cancelScheduled,
      confirmProposal,
      notice,
      person.key,
      profile,
      removeEntry,
      removeLibraryFood,
      restorePlan,
      saveLibraryFood,
      today,
      updateEntryGrams,
      view,
    ],
  );

  return <DietContext.Provider value={value}>{children}</DietContext.Provider>;
}

export function useDiet(): DietValue {
  const value = useContext(DietContext);
  if (!value) throw new Error("useDiet fora do DietProvider.");
  return value;
}

export function useOptionalDiet(): DietValue | null {
  return useContext(DietContext);
}
