import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { MonitoredService } from '@shared/projectConfig';
import type { ServiceCheck } from '@shared/types/monitor';
import type { HistoryEntry } from '@/stores/monitor';
import { HistoryStrip, Sparkline, STATUS_TONE } from './charts';

export const openLink = (url: string) => {
  void window.cockpit?.shell?.openExternal(url);
};

/** One tile: status, target, latency, why it is down, actuator components, links and the recent history. */
export function ServiceTile({ service, check, history }: { service: MonitoredService; check?: ServiceCheck; history: HistoryEntry[] }) {
  const status = check?.status ?? 'UNKNOWN';
  const tone = STATUS_TONE[status];
  const latencies = history.map((h) => h.latencyMs).filter((v): v is number => v !== null);
  const components = Object.entries(check?.components ?? {});
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3" data-testid="service-tile" data-service={service.name} data-status={check ? status : 'pending'}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${check ? tone.dot : 'bg-muted-foreground/40'}`} />
            <span className="truncate font-medium">{service.name}</span>
          </div>
          <div className="truncate text-[11px] text-muted-foreground" title={check?.target}>
            {check?.target ?? (service.check.kind === 'tcp' ? `${service.check.host}:${service.check.port}` : service.check.url)}
          </div>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${check ? tone.badge : 'bg-muted text-muted-foreground'}`} data-testid="service-status">
          {check ? status : '…'}
        </span>
      </div>

      {check?.reason && (
        <div className="truncate text-xs text-destructive" title={check.reason} data-testid="service-reason">
          {check.reason}
        </div>
      )}

      {components.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {components.map(([name, s]) => (
            <span key={name} className={`rounded px-1 text-[10px] ${s === 'UP' ? 'bg-muted text-muted-foreground' : STATUS_TONE.DOWN.badge}`}>
              {name}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end justify-between gap-2">
        <Sparkline values={latencies} width={110} height={24} label={`${service.name} response time`} testId="service-sparkline" />
        <span className="text-[11px] tabular-nums text-muted-foreground">{check?.latencyMs != null ? `${check.latencyMs} ms` : ''}</span>
      </div>
      <HistoryStrip statuses={history} label={`${service.name}: last ${history.length} checks`} />

      {service.links.length > 0 && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {service.links.map((l) => (
            <button key={l.url} type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => openLink(l.url)}>
              {l.label} <ExternalLink className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The services grouped by their `group`, in the order the groups first appear in the config. */
export function ServiceBoard({ services, checks, history }: { services: MonitoredService[]; checks: ServiceCheck[]; history: Record<string, HistoryEntry[]> }) {
  const groups: [string, MonitoredService[]][] = [];
  for (const s of services) {
    const g = groups.find(([name]) => name === s.group);
    if (g) g[1].push(s);
    else groups.push([s.group, [s]]);
  }
  const byName = new Map(checks.map((c) => [c.name, c]));
  return (
    <div className="space-y-4">
      {groups.map(([group, members]) => {
        const up = members.filter((m) => byName.get(m.name)?.status === 'UP').length;
        return (
          <section key={group} data-testid="service-group" data-group={group}>
            <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
              {group}
              <span className="text-xs font-normal text-muted-foreground">
                {up}/{members.length} up
              </span>
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {members.map((s) => (
                <ServiceTile key={s.name} service={s} check={byName.get(s.name)} history={history[s.name] ?? []} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
