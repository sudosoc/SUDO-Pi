import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface GpioPin {
  pin: number;
  gpio: number;
  name: string;
  mode: "IN" | "OUT" | "PWM" | "ALT" | "POWER" | "GND";
  value: number | null;
  pwm_freq: number | null;
  pwm_duty: number | null;
}

const PIN_COLORS: Record<string, string> = {
  IN: "border-info text-info",
  OUT: "border-success text-success",
  PWM: "border-warning text-warning",
  ALT: "border-primary text-primary",
  POWER: "border-destructive text-destructive",
  GND: "border-muted-foreground text-muted-foreground",
};

export default function GpioPage() {
  const [selectedPin, setSelectedPin] = useState<GpioPin | null>(null);

  const { data: pins, isLoading, refetch } = useQuery({
    queryKey: ["gpio-pins"],
    queryFn: async () => {
      const { data } = await apiClient.get("/gpio/pins");
      return data as GpioPin[];
    },
    refetchInterval: 2000,
  });

  const setPinMutation = useMutation({
    mutationFn: ({ gpio, value }: { gpio: number; value: number }) =>
      apiClient.post(`/gpio/pins/${gpio}/set`, { value }),
    onSuccess: () => refetch(),
  });

  const setModeMutation = useMutation({
    mutationFn: ({ gpio, mode }: { gpio: number; mode: string }) =>
      apiClient.post(`/gpio/pins/${gpio}/mode`, { mode }),
    onSuccess: () => refetch(),
  });

  const setPwmMutation = useMutation({
    mutationFn: ({ gpio, freq, duty }: { gpio: number; freq: number; duty: number }) =>
      apiClient.post(`/gpio/pins/${gpio}/pwm`, { frequency: freq, duty_cycle: duty }),
    onSuccess: () => refetch(),
  });

  const configurable = (pins ?? []).filter((p) => !["POWER", "GND"].includes(p.mode));

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>GPIO Pinout (40-pin Header)</CardTitle></CardHeader>
          <CardContent>
            <div className="font-mono text-xs grid gap-0.5">
              {Array.from({ length: 20 }).map((_, row) => {
                const leftPin = pins?.find((p) => p.pin === row * 2 + 1);
                const rightPin = pins?.find((p) => p.pin === row * 2 + 2);
                return (
                  <div key={row} className="flex items-center gap-1">
                    <div
                      className={cn(
                        "flex-1 flex items-center justify-end gap-1.5 p-1 rounded cursor-pointer hover:bg-secondary/30 transition-colors",
                        selectedPin?.pin === leftPin?.pin && "bg-primary/10"
                      )}
                      onClick={() => leftPin && setSelectedPin(selectedPin?.pin === leftPin.pin ? null : leftPin)}
                    >
                      <span className="text-muted-foreground hidden sm:inline truncate max-w-[80px]">{leftPin?.name ?? ""}</span>
                      <span className={cn("border rounded px-1", PIN_COLORS[leftPin?.mode ?? "GND"] ?? "border-muted-foreground")}>
                        {leftPin?.pin ?? ""}
                      </span>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-muted shrink-0" />
                    <div
                      className={cn(
                        "flex-1 flex items-center gap-1.5 p-1 rounded cursor-pointer hover:bg-secondary/30 transition-colors",
                        selectedPin?.pin === rightPin?.pin && "bg-primary/10"
                      )}
                      onClick={() => rightPin && setSelectedPin(selectedPin?.pin === rightPin.pin ? null : rightPin)}
                    >
                      <span className={cn("border rounded px-1", PIN_COLORS[rightPin?.mode ?? "GND"] ?? "border-muted-foreground")}>
                        {rightPin?.pin ?? ""}
                      </span>
                      <span className="text-muted-foreground hidden sm:inline truncate max-w-[80px]">{rightPin?.name ?? ""}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {Object.entries(PIN_COLORS).map(([mode, cls]) => (
                <div key={mode} className="flex items-center gap-1 text-xs">
                  <div className={cn("w-3 h-3 rounded border", cls)} />
                  <span className="text-muted-foreground">{mode}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {selectedPin ? `Pin ${selectedPin.pin} — GPIO${selectedPin.gpio}` : "Pin Control"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedPin ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <p className="text-sm">Select a pin from the pinout</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Pin</span>
                    <span className="font-medium">{selectedPin.pin}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">GPIO</span>
                    <span className="font-medium">GPIO{selectedPin.gpio}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Function</span>
                    <span className="font-medium">{selectedPin.name}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Mode</span>
                    <Badge variant="outline" className={cn("w-fit text-[10px]", PIN_COLORS[selectedPin.mode] ?? "")}>
                      {selectedPin.mode}
                    </Badge>
                  </div>
                </div>

                {["IN", "OUT"].includes(selectedPin.mode) && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Mode</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={selectedPin.mode === "IN" ? "default" : "outline"}
                        onClick={() => setModeMutation.mutate({ gpio: selectedPin.gpio, mode: "IN" })}
                        loading={setModeMutation.isPending}
                      >
                        INPUT
                      </Button>
                      <Button
                        size="sm"
                        variant={selectedPin.mode === "OUT" ? "default" : "outline"}
                        onClick={() => setModeMutation.mutate({ gpio: selectedPin.gpio, mode: "OUT" })}
                        loading={setModeMutation.isPending}
                      >
                        OUTPUT
                      </Button>
                    </div>
                  </div>
                )}

                {selectedPin.mode === "OUT" && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Output Value</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={selectedPin.value === 0 ? "default" : "outline"}
                        className={selectedPin.value === 0 ? "" : ""}
                        onClick={() => setPinMutation.mutate({ gpio: selectedPin.gpio, value: 0 })}
                        loading={setPinMutation.isPending}
                      >
                        LOW (0)
                      </Button>
                      <Button
                        size="sm"
                        variant={selectedPin.value === 1 ? "default" : "outline"}
                        onClick={() => setPinMutation.mutate({ gpio: selectedPin.gpio, value: 1 })}
                        loading={setPinMutation.isPending}
                      >
                        HIGH (1)
                      </Button>
                    </div>
                    {selectedPin.value !== null && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Current: <span className={selectedPin.value ? "text-success" : "text-muted-foreground"}>{selectedPin.value ? "HIGH" : "LOW"}</span>
                      </p>
                    )}
                  </div>
                )}

                {selectedPin.mode === "IN" && selectedPin.value !== null && (
                  <div className="p-3 rounded bg-secondary/30 text-sm">
                    <span className="text-muted-foreground">Input: </span>
                    <span className={selectedPin.value ? "text-success font-bold" : "text-muted-foreground"}>
                      {selectedPin.value ? "HIGH (1)" : "LOW (0)"}
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
