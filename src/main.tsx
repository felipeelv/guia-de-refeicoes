import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { PersonBar, TabBar } from "./components/PersonBar.tsx";
import { LogProvider, useLog } from "./components/LogContext.tsx";
import {
  bundledCatalog,
  CatalogContext,
  useCatalog,
} from "./catalog/context.tsx";
import { fetchRemoteCatalog } from "./catalog/remote.ts";
import { adjustedMeals } from "./domain/day-log.ts";
import type { Person } from "./domain/types.ts";
import { DietProvider, useDiet } from "./diet/DietContext.tsx";
import { dietFlags } from "./diet/flags.ts";
import { CalculateDietPage } from "./pages/CalculateDietPage.tsx";
import { DiaryPage } from "./pages/DiaryPage.tsx";
import { AlimentosPage } from "./pages/AlimentosPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { MealBuilderPage } from "./pages/MealBuilderPage.tsx";
import { MyDietPage } from "./pages/MyDietPage.tsx";
import "./style.css";

function AdjustedOutlet({ person }: { person: Person }) {
  const { consumedByMeal } = useLog();
  const diet = useDiet();
  const adjusted = useMemo<Person>(() => {
    if (dietFlags.diaryV2) return { ...person, meals: diet.operationalMeals };
    return { ...person, meals: adjustedMeals(person.meals, consumedByMeal) };
  }, [person, consumedByMeal, diet.operationalMeals]);
  return <Outlet context={adjusted} />;
}

function DietNotice() {
  const { notice } = useDiet();
  if (!notice) return null;
  return (
    <p className="mx-auto w-full max-w-md px-5 pt-2 text-sm text-guide-danger" role="status">
      {notice}
    </p>
  );
}

function PersonLayout() {
  const { persons } = useCatalog();
  const { personKey } = useParams();
  const person = persons.find((option) => option.key === personKey) ?? null;
  if (!person) return <DefaultRedirect />;
  return (
    <DietProvider key={person.key} person={person}>
      <LogProvider person={person}>
        <PersonBar person={person} />
        <DietNotice />
        <AdjustedOutlet person={person} />
        <TabBar person={person} />
      </LogProvider>
    </DietProvider>
  );
}

function DefaultRedirect() {
  const { persons } = useCatalog();
  return <Navigate to={`/${persons[0]!.key}`} replace />;
}

function LegacyMealRedirect() {
  const { persons } = useCatalog();
  const { mealKey } = useParams();
  const { search } = useLocation();
  return (
    <Navigate
      to={`/${persons[0]!.key}/refeicoes/${mealKey ?? ""}${search}`}
      replace
    />
  );
}

const rootElement = document.querySelector("#root");
if (!rootElement) throw new Error("Elemento #root ausente.");
const container: Element = rootElement;

async function bootstrap() {
  const remote = await fetchRemoteCatalog();
  createRoot(container).render(
    <StrictMode>
      <CatalogContext.Provider value={remote ?? bundledCatalog}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<DefaultRedirect />} />
            <Route path="/refeicoes/:mealKey" element={<LegacyMealRedirect />} />
            <Route path="/:personKey" element={<PersonLayout />}>
              <Route index element={<HomePage />} />
              <Route path="alimentos" element={<AlimentosPage />} />
              <Route path="refeicoes/:mealKey" element={<MealBuilderPage />} />
              <Route path="diario" element={<DiaryPage />} />
              <Route path="calcular-dieta" element={<CalculateDietPage />} />
              <Route path="minha-dieta" element={<MyDietPage />} />
            </Route>
            <Route path="*" element={<DefaultRedirect />} />
          </Routes>
        </BrowserRouter>
      </CatalogContext.Provider>
    </StrictMode>,
  );
}

void bootstrap();
