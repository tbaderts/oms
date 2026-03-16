import React from 'react';
import { useRequirementsStore } from '@/stores/requirements';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Monitor, Globe } from 'lucide-react';

const TYPE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  human: User,
  system: Monitor,
  external: Globe,
};

export function ActorsTab() {
  const actors = useRequirementsStore((s) => s.actors);

  if (actors.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No actors found in the knowledge base.</p>;
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {actors.map((actor) => {
        const Icon = TYPE_ICONS[actor.type] || User;
        return (
          <Card key={actor.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{actor.name || actor.id}</CardTitle>
              </div>
              <Badge variant="outline" className="w-fit">{actor.type}</Badge>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="text-muted-foreground mb-3">{actor.description}</p>
              {actor.responsibilities.length > 0 && (
                <div>
                  <h4 className="font-medium mb-1">Responsibilities</h4>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
                    {actor.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
