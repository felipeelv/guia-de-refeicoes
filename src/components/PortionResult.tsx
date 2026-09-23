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
        <p className="m-0 font-bold">{item.name}</p>
        <p className="m-0 text-sm text-guide-muted">{preparation}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="m-0 font-display text-3xl leading-none tabular-nums">
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
      <span className="flex size-6 items-center justify-center rounded-full border border-guide-line font-display text-sm leading-none text-guide-accent">
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
}: {
  result: PortionCalculationResult;
  carbohydrate: Food;
  secondCarbohydrate: Food | null;
  protein: Food;
}) {
  const foods = secondCarbohydrate
    ? [carbohydrate, secondCarbohydrate, protein]
    : [carbohydrate, protein];
  const items =
    result.secondCarbohydrate && secondCarbohydrate
      ? [result.carbohydrate, result.secondCarbohydrate, result.protein]
      : [result.carbohydrate, result.protein];
  const within = result.toleranceStatus === "within";
  return (
    <section className="grid gap-4 rounded-3xl border border-guide-line bg-guide-card p-4 shadow-card">
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
        className={`rounded-2xl p-3 text-center ${
          within ? "bg-guide-success-bg" : "bg-guide-selected"
        }`}
      >
        <p
          className={`m-0 text-sm font-bold ${
            within ? "text-guide-success" : "text-guide-accent"
          }`}
        >
          {formatMargin(result)}
        </p>
      </div>
      <DataSourceNotice foods={foods} />
    </section>
  );
}
