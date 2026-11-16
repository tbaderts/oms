import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAiKeysStore } from '@/stores/aiKeys';
import type { AiKeySource, AiProviderId } from '@shared/types/ai';
import { isAcceptableEnvVarField } from '@shared/envVarName';

const PROVIDERS: { id: AiProviderId; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'local', label: 'Local' },
];

const SOURCE_TEXT: Record<AiKeySource, (envVar: string) => string> = {
  saved: () => 'saved key',
  env: (v) => `the ${v} environment variable`,
  legacy: () => 'a plain-text key left in config.json (OS encryption was unavailable)',
  none: () => 'nothing (not configured)',
};

interface Props {
  envVar: string;
  onEnvVarChange: (value: string) => void;
  /** Told whether the env-var name is acceptable (AC-9). Settings also checks the draft itself. */
  onValidityChange?: (valid: boolean) => void;
}

function KeyRow({ id, label }: { id: AiProviderId; label: string }) {
  const { status, errors, set, clear } = useAiKeysStore();
  const [value, setValue] = useState('');
  const saved = Boolean(status?.saved[id]);

  const save = async () => {
    const key = value.trim();
    if (!key) return;
    setValue(''); // the key never stays in the form, whatever the result
    await set(id, key);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Label htmlFor={`key-${id}`} className="w-24 shrink-0">
          {label}
        </Label>
        <span className={`w-16 shrink-0 text-xs ${saved ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} data-testid={`key-status-${id}`}>
          {saved ? 'Saved' : 'Not set'}
        </span>
        <Input
          id={`key-${id}`}
          type="password"
          autoComplete="off"
          placeholder={saved ? 'Replace the saved key…' : 'Paste a key…'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          aria-label={`${label} API key`}
        />
        <Button size="sm" onClick={() => void save()} disabled={!value.trim()} aria-label={`Save ${label} key`}>
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={() => void clear(id)} disabled={!saved} aria-label={`Clear ${label} key`}>
          Clear
        </Button>
      </div>
      {errors[id] && (
        <p className="pl-24 text-xs text-red-600 dark:text-red-400" data-testid={`key-error-${id}`}>
          {errors[id]}
        </p>
      )}
    </div>
  );
}

/**
 * Settings → AI → API keys (SPEC-0063): one key per provider, encrypted by the main process with
 * the OS account and never shown again, plus the environment-variable fallback.
 */
export function AiKeysSection({ envVar, onEnvVarChange, onValidityChange }: Props) {
  const { status, load } = useAiKeysStore();
  const valid = isAcceptableEnvVarField(envVar);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div>
        <p className="text-sm font-medium">API keys</p>
        <p className="text-xs text-muted-foreground">
          Keys are encrypted with your OS account and never shown again; each provider uses its own key.
        </p>
      </div>
      {status && !status.available && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          OS encryption is unavailable on this system, so keys cannot be saved here. Use the environment variable below.
        </p>
      )}
      {PROVIDERS.map((p) => (
        <KeyRow key={p.id} id={p.id} label={p.label} />
      ))}
      {status && (
        <p className="text-xs text-muted-foreground" data-testid="key-active-source">
          The active provider ({status.active.provider}) uses: {SOURCE_TEXT[status.active.source](status.active.envVar)}.
        </p>
      )}
      <div className="space-y-1 pt-1">
        <Label htmlFor="apiKeyEnv">Environment variable name (fallback)</Label>
        <Input id="apiKeyEnv" value={envVar} onChange={(e) => onEnvVarChange(e.target.value)} aria-invalid={!valid} />
        {valid ? (
          <p className="text-xs text-muted-foreground">
            Used only when no key is saved for the provider. Enter the variable's <em>name</em> (e.g. <code>ANTHROPIC_API_KEY</code>), not the key.
          </p>
        ) : (
          <p className="text-xs text-red-600 dark:text-red-400" data-testid="env-var-error">
            This must be a variable name (letters, digits, _), not a key. To store a key, use the fields above.
          </p>
        )}
      </div>
    </div>
  );
}
