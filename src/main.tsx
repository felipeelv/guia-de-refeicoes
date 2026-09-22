import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage.tsx";
import { MealBuilderPage } from "./pages/MealBuilderPage.tsx";
import "./style.css";

const root = document.querySelector("#root");
if (!root) throw new Error("Elemento #root ausente.");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/refeicoes/:mealKey" element={<MealBuilderPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
