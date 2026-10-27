import React, { useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useApiExplorerStore } from '@/stores/apiExplorer';

const NEW_FILE = '__new__';

/** Saves the editor body as a named block in a `.http` template file (SPEC-0008). */
export function SaveTemplateDialog({ disabled }: { disabled?: boolean }) {
  const templates = useApiExplorerStore((s) => s.templates);
  const saveTemplate = useApiExplorerStore((s) => s.saveTemplate);
  const templateSource = useApiExplorerStore((s) => s.templateSource);
  const targets = templates.filter((s) => !s.missing && !s.error).map((s) => s.path);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [fileName, setFileName] = useState('');
  const [useVariables, setUseVariables] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The template's own file first: it declares the variables the body uses.
  const fallback = templateSource && targets.includes(templateSource) ? templateSource : targets[0];
  const chosen = target || fallback || NEW_FILE;
  const valid = name.trim() !== '' && (chosen !== NEW_FILE || fileName.trim() !== '');

  const show = () => {
    setName('');
    setTarget('');
    setError(null);
    setUseVariables(true);
    setOpen(true);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveTemplate(chosen === NEW_FILE ? { newFile: fileName.trim() } : { path: chosen }, name.trim(), useVariables);
      if (result.ok) setOpen(false);
      else setError(result.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={show} disabled={disabled}>
        <Save className="mr-1 h-3.5 w-3.5" />
        Save as template
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="template-name">Name</Label>
              <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="INTC limit buy" maxLength={80} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="template-target">Save to</Label>
              <select
                id="template-target"
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={chosen}
                onChange={(e) => setTarget(e.target.value)}
              >
                {targets.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value={NEW_FILE}>New file in api-templates…</option>
              </select>
            </div>
            {chosen === NEW_FILE && (
              <div className="space-y-1">
                <Label htmlFor="template-file">File name</Label>
                <Input id="template-file" value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="my-orders.http" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch id="template-variables" checked={useVariables} onCheckedChange={setUseVariables} />
              <Label htmlFor="template-variables">Use variables for clOrdId, commandId and times</Label>
            </div>
            {error && (
              <p role="alert" className="rounded bg-red-500/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={!valid || saving}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
