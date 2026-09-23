import { readFileSync } from "node:fs";
import { MEALS } from "../src/catalog/meals.ts";
import { PERSONS } from "../src/catalog/persons.ts";

function loadEnvFile(path: string): Record<string, string> {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*"?([^"\n]*)?"?\s*$/.exec(line);
    if (match?.[1]) env[match[1]] = (match[2] ?? "").trim();
  }
  return env;
}

const env = { ...loadEnvFile(".env.local"), ...process.env };
const storeId = env.GLOBAL_CONFIG_ID;
const apiToken = env.VERCEL_API_TOKEN;

if (!storeId) {
  console.error("Defina GLOBAL_CONFIG_ID no .env.local (id ecfg_... do store).");
  process.exit(1);
}
if (!apiToken) {
  console.error(
    "Escrita exige um token da Vercel. Crie em https://vercel.com/account/tokens " +
      "e defina VERCEL_API_TOKEN no .env.local.",
  );
  process.exit(1);
}

const rawFoods = JSON.parse(readFileSync("src/catalog/foods.json", "utf8"));

const items = [
  { operation: "upsert", key: "foods", value: rawFoods },
  { operation: "upsert", key: "persons", value: PERSONS },
  { operation: "upsert", key: "meals", value: MEALS },
];

console.log(
  `Enviando para o Global Config ${storeId}: foods=${rawFoods.length}, persons=${PERSONS.length}, meals=${MEALS.length}`,
);

const response = await fetch(
  `https://api.vercel.com/v1/edge-config/${storeId}/items`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items }),
  },
);
const body = await response.text();
if (!response.ok) {
  console.error(`Falha ${response.status}: ${body}`);
  process.exit(1);
}
console.log(`Gravado com sucesso (${response.status}): ${body}`);
