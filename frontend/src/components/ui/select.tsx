import * as React from "react";
import { cn } from "@/lib/utils";

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SelectContext = React.createContext<SelectContextValue>({
  value: "",
  onValueChange: () => {},
  open: false,
  setOpen: () => {},
});

interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}

function Select({ value, defaultValue, onValueChange, children }: SelectProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
  const [open, setOpen] = React.useState(false);
  const controlled = value !== undefined;
  const current = controlled ? value! : internalValue;

  const handleChange = (v: string) => {
    if (!controlled) setInternalValue(v);
    onValueChange?.(v);
    setOpen(false);
  };

  return (
    <SelectContext.Provider value={{ value: current, onValueChange: handleChange, open, setOpen }}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

function SelectTrigger({ className, children }: { className?: string; children: React.ReactNode }) {
  const { open, setOpen } = React.useContext(SelectContext);
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {children}
      <svg
        className={cn("w-4 h-4 text-muted-foreground transition-transform ml-2 shrink-0", open && "rotate-180")}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value } = React.useContext(SelectContext);
  const [label, setLabel] = React.useState<string>(value);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const root = ref.current?.closest("[data-select-root]");
    if (!root) return;
    const items = root.querySelectorAll("[data-select-value]");
    let found = false;
    items.forEach((item) => {
      if (item.getAttribute("data-select-value") === value) {
        setLabel(item.textContent ?? value);
        found = true;
      }
    });
    if (!found) setLabel(value);
  }, [value]);

  return (
    <span ref={ref} className={cn(!label && !value && "text-muted-foreground")}>
      {label || placeholder || ""}
    </span>
  );
}

function SelectContent({ className, children }: { className?: string; children: React.ReactNode }) {
  const { open, setOpen } = React.useContext(SelectContext);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.closest(".relative")?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      data-select-root
      className={cn(
        "absolute z-50 top-full mt-1 w-full min-w-[8rem] overflow-hidden rounded-md border border-border bg-card shadow-md text-foreground",
        className,
      )}
    >
      <div className="p-1 max-h-60 overflow-y-auto">{children}</div>
    </div>
  );
}

function SelectItem({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { value: selected, onValueChange } = React.useContext(SelectContext);
  return (
    <div
      data-select-value={value}
      role="option"
      aria-selected={selected === value}
      onClick={() => onValueChange(value)}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
        selected === value && "bg-accent/50 font-medium",
        className,
      )}
    >
      {children}
      {selected === value && (
        <span className="absolute right-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )}
    </div>
  );
}

function SelectSeparator({ className }: { className?: string }) {
  return <div className={cn("-mx-1 my-1 h-px bg-muted", className)} />;
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectSeparator };
