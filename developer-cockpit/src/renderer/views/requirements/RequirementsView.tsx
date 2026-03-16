import React, { useEffect } from 'react';
import { useRequirementsStore } from '@/stores/requirements';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UseCasesTab } from './UseCasesTab';
import { FunctionalReqTab } from './FunctionalReqTab';
import { NonFunctionalReqTab } from './NonFunctionalReqTab';
import { ActorsTab } from './ActorsTab';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export function RequirementsView() {
  const { loading, loadAll } = useRequirementsStore();

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Requirements Explorer</h1>
        <p className="text-sm text-muted-foreground">Browse use cases, functional and non-functional requirements, and actors</p>
      </div>

      <Tabs defaultValue="use-cases">
        <TabsList>
          <TabsTrigger value="use-cases">Use Cases</TabsTrigger>
          <TabsTrigger value="functional">Functional Requirements</TabsTrigger>
          <TabsTrigger value="non-functional">Non-Functional Requirements</TabsTrigger>
          <TabsTrigger value="actors">Actors</TabsTrigger>
        </TabsList>

        <TabsContent value="use-cases">
          <UseCasesTab />
        </TabsContent>
        <TabsContent value="functional">
          <FunctionalReqTab />
        </TabsContent>
        <TabsContent value="non-functional">
          <NonFunctionalReqTab />
        </TabsContent>
        <TabsContent value="actors">
          <ActorsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
