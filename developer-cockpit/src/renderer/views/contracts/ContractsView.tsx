import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SpecsEditorView } from '@/views/specs-editor/SpecsEditorView';
import { DomainModelView } from '@/views/domain-model/DomainModelView';
import { CodeGeneratorView } from '@/views/code-generator/CodeGeneratorView';

/** The OMS contracts (oms-contracts OpenAPI and Avro): edit them, browse the model, regenerate code. */
export function ContractsView() {
  return (
    <Tabs defaultValue="editor" className="flex h-full flex-col">
      <div className="border-b px-4 pt-2">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="domain-model">Domain Model</TabsTrigger>
          <TabsTrigger value="code-generation">Code Generation</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="editor" className="mt-0 min-h-0 flex-1">
        <SpecsEditorView />
      </TabsContent>
      <TabsContent value="domain-model" className="mt-0 min-h-0 flex-1 overflow-auto">
        <DomainModelView />
      </TabsContent>
      <TabsContent value="code-generation" className="mt-0 min-h-0 flex-1 overflow-auto">
        <CodeGeneratorView />
      </TabsContent>
    </Tabs>
  );
}
