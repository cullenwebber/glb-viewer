import * as React from "react";
import { cn } from "@/lib/utils";
import { numericAttribute, scrubbedNumber } from "@/lib/number-scrub";

type InputProps = React.ComponentProps<"input"> & {
  onValueScrubStart?: () => void;
  onValueScrubEnd?: (cancelled: boolean) => void;
};

function Input({
  className,
  type,
  onValueScrubStart,
  onValueScrubEnd,
  ...props
}: InputProps) {
  const gesture = React.useRef<{
    pointer: number;
    startX: number;
    lastX: number;
    start: number;
    original: string;
    amount: number;
    step: number;
    min: number;
    max: number;
    started: boolean;
  } | null>(null);
  const suppressClick = React.useRef(false);
  const writeValue = (element: HTMLInputElement, value: string) => {
    if (element.value === value) return;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const finish = (element: HTMLInputElement, cancelled = false) => {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    element.removeAttribute("data-scrubbing");
    if (current.started) {
      if (cancelled) writeValue(element, current.original);
      suppressClick.current = true;
      onValueScrubEnd?.(cancelled);
    } else if (!cancelled) element.select();
    if (element.hasPointerCapture(current.pointer))
      element.releasePointerCapture(current.pointer);
  };
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        type === "number" &&
          "cursor-ew-resize touch-pan-y [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none data-[scrubbing]:border-ring data-[scrubbing]:ring-2 data-[scrubbing]:ring-ring/50",
        className,
      )}
      {...props}
      title={
        props.title ??
        (type === "number"
          ? "Drag left/right to adjust · Shift: fine · Ctrl/⌘: coarse · Click to type · Esc: cancel drag"
          : undefined)
      }
      onPointerDown={(event) => {
        props.onPointerDown?.(event);
        if (
          type !== "number" ||
          event.defaultPrevented ||
          event.button !== 0 ||
          props.disabled ||
          props.readOnly ||
          event.detail > 1
        )
          return;
        const element = event.currentTarget;
        const start = element.valueAsNumber;
        if (!Number.isFinite(start)) return;
        const step = numericAttribute(
          element.getAttribute("step"),
          element.step === "any" ? 0.01 : 1,
        );
        gesture.current = {
          pointer: event.pointerId,
          startX: event.clientX,
          lastX: event.clientX,
          start,
          original: element.value,
          amount: 0,
          step: step > 0 ? step : 1,
          min: numericAttribute(element.getAttribute("min"), -Infinity),
          max: numericAttribute(element.getAttribute("max"), Infinity),
          started: false,
        };
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
        element.focus({ preventScroll: true });
        element.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        props.onPointerMove?.(event);
        const current = gesture.current;
        if (!current || current.pointer !== event.pointerId) return;
        if (!current.started) {
          if (Math.abs(event.clientX - current.startX) < 3) return;
          current.started = true;
          event.currentTarget.setAttribute("data-scrubbing", "true");
          onValueScrubStart?.();
        }
        event.preventDefault();
        event.stopPropagation();
        const sensitivity = event.shiftKey
          ? 0.1
          : event.ctrlKey || event.metaKey
            ? 10
            : 1;
        current.amount +=
          ((event.clientX - current.lastX) * current.step * sensitivity) / 4;
        current.lastX = event.clientX;
        const value = scrubbedNumber(
          current.start,
          current.amount,
          current.step,
          current.min,
          current.max,
          event.shiftKey,
        );
        if (value === current.min || value === current.max)
          current.amount = value - current.start;
        writeValue(event.currentTarget, String(value));
      }}
      onPointerUp={(event) => {
        props.onPointerUp?.(event);
        if (gesture.current?.pointer !== event.pointerId) return;
        event.stopPropagation();
        finish(event.currentTarget);
      }}
      onPointerCancel={(event) => {
        props.onPointerCancel?.(event);
        if (gesture.current?.pointer === event.pointerId)
          finish(event.currentTarget, true);
      }}
      onLostPointerCapture={(event) => {
        props.onLostPointerCapture?.(event);
        if (gesture.current?.pointer === event.pointerId)
          finish(event.currentTarget, true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && gesture.current) {
          event.preventDefault();
          event.stopPropagation();
          finish(event.currentTarget, true);
          return;
        }
        props.onKeyDown?.(event);
      }}
      onClick={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        props.onClick?.(event);
      }}
    />
  );
}

export { Input };
