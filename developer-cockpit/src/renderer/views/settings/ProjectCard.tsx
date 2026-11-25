import React from 'react';
import type { ProjectConfigResult } from '@shared/projectConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * The project's `cockpit.yaml` (SPEC-0076): where it is, whether it is valid, and the project
 * settings it supplies. Those settings are edited in the file, not here.
 */
export function ProjectCard({ project }: { project: ProjectConfigResult | null }) {
  if (!project) return null;
  const { config, errors, present, file } = project;
  const status = !present ? 'not found' : errors.length ? `${errors.length} error${errors.length === 1 ? '' : 's'}` : 'valid';
  const tone = !present ? 'text-muted-foreground' : errors.length ? 'text-destructive' : 'text-green-600 dark:text-green-400';
  const rows: [string, string][] = [
    ['Project', config.project.name],
    ['Knowledge base', config.knowledgeBase.root],
    ['Contracts', [...config.specs.openApiPaths, ...config.specs.avroPaths].join(', ') || '—'],
    ['Code generation tasks', String(config.codegen.length)],
    ['APIs', config.apiExplorer.apis.map((a) => a.name).join(', ') || '—'],
    ['Monitored services', String(config.monitoring.services.length)],
    ['Metric panels', String(config.monitoring.panels.length)],
  ];
  return (
    <Card className="mb-4" data-testid="project-card">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-2">
          Project file
          <span className={`text-sm font-normal ${tone}`} data-testid="project-status">
            {status}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="break-all font-mono text-xs text-muted-foreground">{file}</div>
        {!present && <p className="text-xs text-muted-foreground">Without this file the cockpit uses its defaults and the settings below.</p>}
        {errors.length > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="project-errors-effect">
            Until these are fixed none of the file applies: no code-generation tasks, APIs, templates, links or monitoring, and the
            paths below fall back to your own settings.
          </p>
        )}
        {errors.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 font-mono text-xs text-destructive" data-testid="project-errors">
            {errors.map((e, i) => (
              <li key={i}>
                {e.path ? `${e.path}: ` : ''}
                {e.message}
              </li>
            ))}
          </ul>
        )}
        {present && errors.length === 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            {rows.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="break-all">{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
