import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

function DefaultIllustration() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="opacity-30"
      aria-hidden="true"
    >
      {/* Box outline */}
      <rect
        x="8"
        y="16"
        width="48"
        height="38"
        rx="4"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="5 3"
      />
      {/* Lid flap left */}
      <path
        d="M8 24 L32 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Lid flap right */}
      <path
        d="M56 24 L32 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Horizontal lines suggesting content */}
      <line
        x1="18"
        y1="34"
        x2="46"
        y2="34"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="18"
        y1="41"
        x2="40"
        y2="41"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="18"
        y1="48"
        x2="34"
        y2="48"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 text-center px-6",
        className
      )}
    >
      {/* Illustration or custom icon */}
      <div className="mb-4 text-muted-foreground">
        {Icon ? (
          <Icon className="w-16 h-16 opacity-30" />
        ) : (
          <DefaultIllustration />
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-foreground mb-1">{title}</h3>

      {/* Description */}
      {description && (
        <p className="text-xs text-muted-foreground max-w-xs mb-4">
          {description}
        </p>
      )}

      {/* Action button */}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 px-4 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-muted transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
