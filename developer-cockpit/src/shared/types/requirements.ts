export interface UseCase {
  id: string;
  title: string;
  description: string;
  actors: string[];
  preconditions: string[];
  postconditions: string[];
  mainFlow: string[];
  alternativeFlows: string[];
  source: string;
}

export interface FunctionalRequirement {
  id: string;
  title: string;
  description: string;
  priority: 'must' | 'should' | 'could' | 'wont';
  status: 'draft' | 'approved' | 'implemented' | 'tested';
  source: string;
}

export interface NonFunctionalRequirement {
  id: string;
  title: string;
  description: string;
  category: string;
  metric: string;
  target: string;
  source: string;
}

export interface Actor {
  id: string;
  name: string;
  type: 'human' | 'system' | 'external';
  description: string;
  responsibilities: string[];
  source: string;
}
