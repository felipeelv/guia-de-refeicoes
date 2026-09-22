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
    <div>
      <p className="m-0 font-bold">{item.name}</p>
      <p className="m-0 text-sm text-guide-muted">{preparation}</p>
      <p className="m-0 mt-1 font-display text-3xl tabular-nums">
        {formatPortion(item)}
      </p>
      {detail ? (
        <p className="m-0 text-sm text-guide-muted tabular-nums">{detail}</p>
      ) : null}
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
  return (
    <section className="grid gap-4 rounded-3xl border border-guide-line bg-guide-card p-4">
      {items.map((item, index) => (
        <div key={item.foodId} className="grid gap-4">
          {index > 0 ? (
            <p
              className="m-0 text-center font-display text-2xl text-guide-accent"
              aria-hidden="true"
            >
              +
            </p>
          ) : null}
          <PortionItem
            item={item}
            preparation={foods[index]?.preparation ?? ""}
          />
        </div>
      ))}
      <div className="border-t border-guide-line pt-3">
        <p className="m-0 font-bold text-guide-accent">{formatMargin(result)}</p>
      </div>
      <DataSourceNotice foods={foods} />
    </section>
  );
}
