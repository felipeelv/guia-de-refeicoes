import type { Food, PortionCalculationResult, PortionResultItem } from "../domain/types.ts";
import { formatMargin, formatPortion, formatPortionDetail } from "../format.ts";
import { DataSourceNotice } from "./DataSourceNotice.tsx";

function PortionItem({
  item,
  preparation,
}: {
  item: PortionResultItem;
  preparation: string;
}) {
  const detail = formatPortionDetail(item);
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="m-0 font-medium">{item.name}</p>
        <p className="m-0 text-sm text-guide-muted">{preparation}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="m-0 font-display text-[28px] leading-none tabular-nums">
          {formatPortion(item)}
        </p>
        {detail ? (
          <p className="m-0 mt-1 text-sm text-guide-muted tabular-nums">{detail}</p>
        ) : null}
      </div>
    </div>
  );
}

function PlusDivider() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3">
      <span className="h-px flex-1 bg-guide-line" />
      <span className="flex size-6 items-center justify-center rounded-full bg-guide-line font-display text-sm leading-none text-guide-accent-ink">
        +
      </span>
      <span className="h-px flex-1 bg-guide-line" />
    </div>
  );
}

export function PortionResult({
  result,
  carbohydrate,
  secondCarbohydrate,
  protein,
  secondProtein = null,
  statusLabel = null,
}: {
  result: PortionCalculationResult;
  carbohydrate: Food;
  secondCarbohydrate: Food | null;
  protein: Food;
  secondProtein?: Food | null;
  statusLabel?: string | null;
}) {
  const pairs = [
    { item: result.carbohydrate, food: carbohydrate },
    result.secondCarbohydrate && secondCarbohydrate
      ? { item: result.secondCarbohydrate, food: secondCarbohydrate }
      : null,
    { item: result.protein, food: protein },
    result.secondProtein && secondProtein
      ? { item: result.secondProtein, food: secondProtein }
      : null,
  ].filter((pair): pair is { item: PortionResultItem; food: Food } => pair !== null && pair.item.grams > 0);
  const foods = pairs.map((pair) => pair.food);
  const items = pairs.map((pair) => pair.item);
  const within = statusLabel ? statusLabel === "Combinação dentro das metas calculadas" : result.toleranceStatus === "within";
  return (
    <section className="grid gap-4 rounded-card bg-guide-card p-5 shadow-card">
      {items.map((item, index) => (
        <div key={item.foodId} className="grid gap-4">
          {index > 0 ? <PlusDivider /> : null}
          <PortionItem
            item={item}
            preparation={foods[index]?.preparation ?? ""}
          />
        </div>
      ))}
      <div
        className={`rounded-card p-3 text-center ${
          within ? "bg-guide-success-bg" : "bg-guide-danger-bg"
        }`}
      >
        <p
          className={`m-0 text-sm font-bold ${
            within ? "text-guide-success" : "text-guide-danger"
          }`}
        >
          {statusLabel ?? formatMargin(result)}
        </p>
      </div>
      <DataSourceNotice foods={foods} />
    </section>
  );
}
