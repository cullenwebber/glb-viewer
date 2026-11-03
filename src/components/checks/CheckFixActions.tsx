import { Button } from "@/components/ui/button";
import type { CheckFix, OptimizationOptions } from "@/model-types";

export function isFixSelected(fix: CheckFix, options: OptimizationOptions) {
  return fix.kind === "cleanAttributes"
    ? !!options.cleanAttributes
    : !!options.singleSided?.some(
        (target) =>
          target.key === fix.key && target.primitive === fix.primitive,
      );
}

export function CheckFixActions({
  fix,
  options,
  onChange,
  disabled,
}: {
  fix: CheckFix;
  options: OptimizationOptions;
  onChange: (update: Partial<OptimizationOptions>) => void;
  disabled: boolean;
}) {
  const selected = isFixSelected(fix, options);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => {
        if (fix.kind === "cleanAttributes")
          onChange({ cleanAttributes: !selected });
        else
          onChange({
            singleSided: selected
              ? (options.singleSided || []).filter(
                  (target) =>
                    target.key !== fix.key ||
                    target.primitive !== fix.primitive,
                )
              : [
                  ...(options.singleSided || []),
                  { key: fix.key, primitive: fix.primitive },
                ],
          });
      }}
    >
      {selected
        ? "Undo fix"
        : fix.kind === "cleanAttributes"
          ? "Remove unused attributes"
          : "Make single-sided"}
    </Button>
  );
}
