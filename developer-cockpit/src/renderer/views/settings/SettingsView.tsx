import React, { useState, useEffect } from 'react';
import { useConfigStore } from '@/stores/config';
import type { CockpitConfig } from '@shared/types/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, RotateCcw } from 'lucide-react';

export function SettingsView() {
  const { config, saveConfig, loadConfig } = useConfigStore();
  const [draft, setDraft] = useState<CockpitConfig>(config);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const updateGeneral = (patch: Partial<CockpitConfig['general']>) => {
    setDraft((d) => ({ ...d, general: { ...d.general, ...patch } }));
  };

  const updateScm = (patch: Partial<CockpitConfig['scm']>) => {
    setDraft((d) => ({ ...d, scm: { ...d.scm, ...patch } }));
  };

  const updateAi = (patch: Partial<CockpitConfig['ai']>) => {
    setDraft((d) => ({ ...d, ai: { ...d.ai, ...patch } }));
  };

  const updateKb = (patch: Partial<CockpitConfig['knowledgeBase']>) => {
    setDraft((d) => ({ ...d, knowledgeBase: { ...d.knowledgeBase, ...patch } }));
  };

  const updateInfra = (patch: Partial<CockpitConfig['infrastructure']>) => {
    setDraft((d) => ({ ...d, infrastructure: { ...d.infrastructure, ...patch } }));
  };

  const handleSave = async () => {
    await saveConfig(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    loadConfig();
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">Configure Developer Cockpit preferences</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            {saved ? 'Saved!' : 'Save'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="scm">SCM</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="kb">Knowledge Base</TabsTrigger>
          <TabsTrigger value="infra">Infrastructure</TabsTrigger>
          <TabsTrigger value="specs">Specs</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader><CardTitle>General Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workspaceRoot">Workspace Root</Label>
                <Input
                  id="workspaceRoot"
                  value={draft.general.workspaceRoot}
                  onChange={(e) => updateGeneral({ workspaceRoot: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="theme">Theme</Label>
                <Select
                  value={draft.general.theme}
                  onValueChange={(v) => updateGeneral({ theme: v as 'light' | 'dark' | 'system' })}
                >
                  <SelectTrigger id="theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fontSize">Font Size</Label>
                <Input
                  id="fontSize"
                  type="number"
                  min={10}
                  max={24}
                  value={draft.general.fontSize}
                  onChange={(e) => updateGeneral({ fontSize: parseInt(e.target.value) || 14 })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scm">
          <Card>
            <CardHeader><CardTitle>Source Control Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="defaultBranch">Default Branch</Label>
                <Input
                  id="defaultBranch"
                  value={draft.scm.defaultBranch}
                  onChange={(e) => updateScm({ defaultBranch: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="autoFetch">Auto Fetch</Label>
                <Switch
                  id="autoFetch"
                  checked={draft.scm.autoFetch}
                  onCheckedChange={(checked) => updateScm({ autoFetch: checked })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fetchInterval">Fetch Interval (seconds)</Label>
                <Input
                  id="fetchInterval"
                  type="number"
                  min={30}
                  value={draft.scm.fetchIntervalSeconds}
                  onChange={(e) => updateScm({ fetchIntervalSeconds: parseInt(e.target.value) || 300 })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <Card>
            <CardHeader><CardTitle>AI Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="aiProvider">Provider</Label>
                <Select
                  value={draft.ai.provider}
                  onValueChange={(v) => updateAi({ provider: v as 'anthropic' | 'openai' | 'local' })}
                >
                  <SelectTrigger id="aiProvider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="local">Local</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="aiModel">Model</Label>
                <Input
                  id="aiModel"
                  value={draft.ai.model}
                  onChange={(e) => updateAi({ model: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apiKeyEnv">API Key Environment Variable</Label>
                <Input
                  id="apiKeyEnv"
                  value={draft.ai.apiKeyEnvVar}
                  onChange={(e) => updateAi({ apiKeyEnvVar: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxTokens">Max Tokens</Label>
                <Input
                  id="maxTokens"
                  type="number"
                  min={256}
                  value={draft.ai.maxTokens}
                  onChange={(e) => updateAi({ maxTokens: parseInt(e.target.value) || 4096 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature</Label>
                <Input
                  id="temperature"
                  type="number"
                  step={0.1}
                  min={0}
                  max={2}
                  value={draft.ai.temperature}
                  onChange={(e) => updateAi({ temperature: parseFloat(e.target.value) || 0.7 })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kb">
          <Card>
            <CardHeader><CardTitle>Knowledge Base Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="kbRoot">Root Path</Label>
                <Input
                  id="kbRoot"
                  value={draft.knowledgeBase.rootPath}
                  onChange={(e) => updateKb({ rootPath: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kbExtensions">File Extensions (comma-separated)</Label>
                <Input
                  id="kbExtensions"
                  value={draft.knowledgeBase.fileExtensions.join(', ')}
                  onChange={(e) =>
                    updateKb({ fileExtensions: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kbExclude">Exclude Patterns (comma-separated)</Label>
                <Input
                  id="kbExclude"
                  value={draft.knowledgeBase.excludePatterns.join(', ')}
                  onChange={(e) =>
                    updateKb({ excludePatterns: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="infra">
          <Card>
            <CardHeader><CardTitle>Infrastructure Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="dockerEnabled">Docker Enabled</Label>
                <Switch
                  id="dockerEnabled"
                  checked={draft.infrastructure.dockerEnabled}
                  onCheckedChange={(checked) => updateInfra({ dockerEnabled: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="k8sEnabled">Kubernetes Enabled</Label>
                <Switch
                  id="k8sEnabled"
                  checked={draft.infrastructure.kubernetesEnabled}
                  onCheckedChange={(checked) => updateInfra({ kubernetesEnabled: checked })}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="prometheusUrl">Prometheus URL</Label>
                <Input
                  id="prometheusUrl"
                  value={draft.infrastructure.prometheusUrl}
                  onChange={(e) => updateInfra({ prometheusUrl: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grafanaUrl">Grafana URL</Label>
                <Input
                  id="grafanaUrl"
                  value={draft.infrastructure.grafanaUrl}
                  onChange={(e) => updateInfra({ grafanaUrl: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lokiUrl">Loki URL</Label>
                <Input
                  id="lokiUrl"
                  value={draft.infrastructure.lokiUrl}
                  onChange={(e) => updateInfra({ lokiUrl: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="specs">
          <Card>
            <CardHeader><CardTitle>Specs Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="openApiPaths">OpenAPI Paths (comma-separated)</Label>
                <Input
                  id="openApiPaths"
                  value={draft.specs.openApiPaths.join(', ')}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      specs: { ...d.specs, openApiPaths: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="avroPaths">Avro Paths (comma-separated)</Label>
                <Input
                  id="avroPaths"
                  value={draft.specs.avroPaths.join(', ')}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      specs: { ...d.specs, avroPaths: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) },
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="autoGenerate">Auto Generate on Save</Label>
                <Switch
                  id="autoGenerate"
                  checked={draft.specs.autoGenerate}
                  onCheckedChange={(checked) =>
                    setDraft((d) => ({ ...d, specs: { ...d.specs, autoGenerate: checked } }))
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
