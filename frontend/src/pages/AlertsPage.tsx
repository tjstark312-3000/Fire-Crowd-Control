import { ChangeEvent } from 'react';

import { AlertsPanel } from '../components/AlertsPanel';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { useAppContext } from '../context/AppContext';

export function AlertsPage(): JSX.Element {
  const { alerts, dismissAlert, clearAlerts, alertRules, setAlertRules } = useAppContext();

  const patchRules = (patch: Partial<typeof alertRules>) => {
    setAlertRules({
      ...alertRules,
      ...patch,
    });
  };

  const onNumberChange = (field: keyof typeof alertRules) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    patchRules({
      [field]: Number.isFinite(value) ? value : 0,
    } as Partial<typeof alertRules>);
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      <section className="col-span-12 xl:col-span-5">
        <AlertsPanel alerts={alerts} onDismiss={dismissAlert} onClear={clearAlerts} title="Active Alerts Feed" limit={30} />
      </section>

      <section className="col-span-12 xl:col-span-7 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-4">
        <h2 className="text-base font-semibold">Alert Rules</h2>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Tune threshold, spike, and offline detection logic used for in-app alert generation.</p>

        <div className="mt-4 space-y-4">
          <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-2))] p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Threshold Alert</p>
              <Switch checked={alertRules.threshold_enabled} onCheckedChange={(checked) => patchRules({ threshold_enabled: checked })} />
            </div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))]">
              Crowd count threshold
              <Input type="number" min={1} value={alertRules.threshold_count} onChange={onNumberChange('threshold_count')} className="mt-1" />
            </label>
          </div>

          <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-2))] p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Spike Detection</p>
              <Switch checked={alertRules.spike_enabled} onCheckedChange={(checked) => patchRules({ spike_enabled: checked })} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-[hsl(var(--muted-foreground))]">
                Spike factor
                <Input type="number" min={1.05} step={0.05} value={alertRules.spike_factor} onChange={onNumberChange('spike_factor')} className="mt-1" />
              </label>
              <label className="text-xs text-[hsl(var(--muted-foreground))]">
                Minimum delta
                <Input type="number" min={1} step={1} value={alertRules.spike_delta} onChange={onNumberChange('spike_delta')} className="mt-1" />
              </label>
            </div>
          </div>

          <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-2))] p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Offline Detection</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Emit critical alert when camera status is not online.</p>
              </div>
              <Switch checked={alertRules.offline_enabled} onCheckedChange={(checked) => patchRules({ offline_enabled: checked })} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
