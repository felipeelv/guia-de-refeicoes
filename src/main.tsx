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
import { PersonBar } from "./components/PersonBar.tsx";
import { LogProvider, useLog } from "./components/LogContext.tsx";
import {
  bundledCatalog,
  CatalogContext,
  useCatalog,
} from "./catalog/context.tsx";
import { fetchRemoteCatalog } from "./catalog/remote.ts";
import { adjustedMeals } from "./domain/day-log.ts";
import type { Person } from "./domain/types.ts";
import { DiaryPage } from "./pages/DiaryPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { MealBuilderPage } from "./pages/MealBuilderPage.tsx";
import "./style.css";

function AdjustedOutlet({ person }: { person: Person }) {
  const { consumedByMeal } = useLog();
  const adjusted = useMemo<Person>(
    () => ({ ...person, meals: adjustedMeals(person.meals, consumedByMeal) }),
    [person, consumedByMeal],
  );
  return <Outlet context={adjusted} />;
}

function PersonLayout() {
  const { persons } = useCatalog();
  const { personKey } = useParams();
  const person = persons.find((option) => option.key === personKey) ?? null;
  if (!person) return <DefaultRedirect />;
  return (
    <LogProvider person={person}>
      <PersonBar person={person} />
      <AdjustedOutlet person={person} />
    </LogProvider>
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
              <Route path="refeicoes/:mealKey" element={<MealBuilderPage />} />
              <Route path="diario" element={<DiaryPage />} />
            </Route>
            <Route path="*" element={<DefaultRedirect />} />
          </Routes>
        </BrowserRouter>
      </CatalogContext.Provider>
    </StrictMode>,
  );
}

void bootstrap();
