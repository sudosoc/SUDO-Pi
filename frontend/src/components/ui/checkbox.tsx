import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ checked, defaultChecked, onCheckedChange, disabled, id, className }, ref) => {
    const [internalChecked, setInternalChecked] = React.useState(
      defaultChecked ?? false,
    );
    const controlled = checked !== undefined;
    const isChecked = controlled ? checked! : internalChecked;

    const toggle = () => {
      if (disabled) return;
      const next = !isChecked;
      if (!controlled) setInternalChecked(next);
      onCheckedChange?.(next);
    };

    return (
      <button
        ref={ref}
        id={id}
        type="button"
        role="checkbox"
        aria-checked={isChecked}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isChecked ? "bg-primary text-primary-foreground" : "bg-transparent",
          className,
        )}
      >
        {isChecked && <Check className="w-3 h-3" />}
      </button>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
