import React from 'react';
import { Construction } from 'lucide-react';

interface PlaceholderViewProps {
  name: string;
}

export function PlaceholderView({ name }: PlaceholderViewProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <Construction className="h-16 w-16 opacity-30" />
      <h2 className="text-xl font-medium">{name}</h2>
      <p className="text-sm">This view is planned for a future phase.</p>
    </div>
  );
}
