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

  const { data: pins, isError: pinsError, refetch } = useQuery({
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

  const [pwmFreq, setPwmFreq] = useState(1000);
  const [pwmDuty, setPwmDuty] = useState(50);


  if (pinsError) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium text-muted-foreground">Failed to load GPIO pins</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Ensure <code className="font-mono">pigpio</code> or <code className="font-mono">lgpio</code> is installed and the backend has GPIO access.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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

                {/* PWM mode controls */}
                {selectedPin.mode === "PWM" && (
                  <div className="space-y-3">
                    {selectedPin.pwm_freq != null && (
                      <div className="p-3 rounded bg-secondary/30 text-xs text-muted-foreground grid grid-cols-2 gap-2">
                        <span>Frequency: <strong className="text-warning">{selectedPin.pwm_freq} Hz</strong></span>
                        <span>Duty Cycle: <strong className="text-warning">{selectedPin.pwm_duty}%</strong></span>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Frequency (Hz)</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="range" min={1} max={100000} step={100}
                          value={pwmFreq}
                          onChange={(e) => setPwmFreq(Number(e.target.value))}
                          className="flex-1 accent-warning"
                        />
                        <span className="text-xs font-mono w-20 text-right">{pwmFreq.toLocaleString()} Hz</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Duty Cycle (%)</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="range" min={0} max={100} step={1}
                          value={pwmDuty}
                          onChange={(e) => setPwmDuty(Number(e.target.value))}
                          className="flex-1 accent-warning"
                        />
                        <span className="text-xs font-mono w-12 text-right">{pwmDuty}%</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full mt-1 overflow-hidden">
                        <div className="h-full bg-warning rounded-full transition-all" style={{ width: `${pwmDuty}%` }} />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => setPwmMutation.mutate({ gpio: selectedPin.gpio, freq: pwmFreq, duty: pwmDuty })}
                      loading={setPwmMutation.isPending}
                    >
                      Apply PWM
                    </Button>
                    <div className="flex gap-2 flex-wrap">
                      {[{label:"25%",d:25},{label:"50%",d:50},{label:"75%",d:75},{label:"1kHz",d:pwmDuty,f:1000},{label:"10kHz",d:pwmDuty,f:10000}].map((p) => (
                        <Button
                          key={p.label} size="sm" variant="outline"
                          className="text-[10px] h-6 px-2"
                          onClick={() => {
                            if (p.f) setPwmFreq(p.f); else setPwmDuty(p.d);
                          }}
                        >
                          {p.label}
                        </Button>
                      ))}
                    </div>
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
