import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogContext.Provider value={{ open: open ?? false, onOpenChange: onOpenChange ?? (() => {}) }}>
      {children}
    </DialogContext.Provider>
  );
}

const DialogContext = React.createContext<{ open: boolean; onOpenChange: (open: boolean) => void }>({
  open: false,
  onOpenChange: () => {},
});

function DialogContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { open, onOpenChange } = React.useContext(DialogContext);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          "relative z-50 bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

function DialogHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mb-4", className)}>{children}</div>;
}

function DialogTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h3 className={cn("text-lg font-semibold", className)}>{children}</h3>;
}

function DialogDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cn("text-sm text-muted-foreground mt-1", className)}>{children}</p>;
}

function DialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex justify-end gap-2 mt-6", className)}>{children}</div>;
}

function DialogTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const { onOpenChange } = React.useContext(DialogContext);
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => onOpenChange(true),
    });
  }
  return <span onClick={() => onOpenChange(true)}>{children}</span>;
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger };
