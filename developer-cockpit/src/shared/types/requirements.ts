/** OKF document lifecycle status (front matter `status`). */
export type DocStatus = 'draft' | 'stable' | 'deprecated';
/** How much of a requirement is built and covered by tests (front matter `implementation`). */
export type Implementation = 'implemented' | 'partial' | 'not-implemented';
/** How much of a capability is built (front matter `maturity`). */
export type Maturity = 'implemented' | 'partial' | 'planned';

/** Something the project can do, built or planned (knowledge base `capabilities/`). */
export interface Capability {
  /** File name without `.md`, e.g. `order-capture`. */
  id: string;
  title: string;
  description: string;
  maturity: Maturity;
  commands: string[];
  /** UC ids linked from the capability's body. */
  useCases: string[];
  /** FR/NFR ids linked from the capability's body. */
  requirements: string[];
  status: DocStatus;
  source: string;
}

export interface UseCase {
  id: string;
  title: string;
  description: string;
  /** Actor names, resolved from the `actors` paths. */
  actors: string[];
  /** Capability id (file name without `.md`). */
  capability: string;
  preconditions: string[];
  postconditions: string[];
  mainFlow: string[];
  alternativeFlows: string[];
  /** FR/NFR ids linked from the use case. */
  requirements: string[];
  source: string;
}

export interface FunctionalRequirement {
  id: string;
  title: string;
  description: string;
  priority: 'must' | 'should' | 'could' | 'wont';
  status: DocStatus;
  implementation: Implementation;
  /** Capability id (file name without `.md`). */
  capability: string;
  source: string;
}

export interface NonFunctionalRequirement {
  id: string;
  title: string;
  description: string;
  category: string;
  metric: string;
  target: string;
  implementation: Implementation;
  /** Capability id (file name without `.md`). */
  capability: string;
  source: string;
}

export interface Actor {
  id: string;
  name: string;
  kind: 'human' | 'system' | 'external';
  description: string;
  responsibilities: string[];
  source: string;
}
