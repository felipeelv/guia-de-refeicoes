import { StrictMode } from "react";
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
import { DEFAULT_PERSON, personByKey } from "./catalog/persons.ts";
import { HomePage } from "./pages/HomePage.tsx";
import { MealBuilderPage } from "./pages/MealBuilderPage.tsx";
import "./style.css";

function PersonLayout() {
  const { personKey } = useParams();
  const person = personByKey(personKey);
  if (!person) return <Navigate to={`/${DEFAULT_PERSON.key}`} replace />;
  return (
    <>
      <PersonBar person={person} />
      <Outlet context={person} />
    </>
  );
}

function LegacyMealRedirect() {
  const { mealKey } = useParams();
  const { search } = useLocation();
  return (
    <Navigate
      to={`/${DEFAULT_PERSON.key}/refeicoes/${mealKey ?? ""}${search}`}
      replace
    />
  );
}

const root = document.querySelector("#root");
if (!root) throw new Error("Elemento #root ausente.");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={`/${DEFAULT_PERSON.key}`} replace />} />
        <Route path="/refeicoes/:mealKey" element={<LegacyMealRedirect />} />
        <Route path="/:personKey" element={<PersonLayout />}>
          <Route index element={<HomePage />} />
          <Route path="refeicoes/:mealKey" element={<MealBuilderPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
