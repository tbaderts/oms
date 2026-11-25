import type { ProjectConfig } from '../../shared/projectConfig';

/** What the AI prompts say about the project; from its `cockpit.yaml` (SPEC-0076). */
export interface ProjectIdentity {
  name: string;
  description: string;
  /** Workspace-relative knowledge-base root, used to write citations as `<kbRoot>/<path>`. */
  kbRoot: string;
}

export const DEFAULT_IDENTITY: ProjectIdentity = { name: 'this project', description: '', kbRoot: 'knowledge-base' };

export function identityOf(project: ProjectConfig, kbRoot: string = project.knowledgeBase.root): ProjectIdentity {
  return { name: project.project.name, description: project.project.description, kbRoot };
}

const kbPrefix = (id: ProjectIdentity) => `${id.kbRoot.replace(/\\/g, '/').replace(/^\.?\/+|\/+$/g, '')}/`;
const about = (id: ProjectIdentity) => (id.description.trim() ? ` ${id.description.trim().replace(/\.?$/, '.')}` : '');

/** The assistant's system prompt. */
export function assistantSystem(id: ProjectIdentity = DEFAULT_IDENTITY): string {
  return [
    `You are the developer cockpit assistant for ${id.name}.${about(id)}`,
    'Answer concisely and factually, using the tools available to you when they help.',
    'Do not invent identifiers, endpoints, or file paths that a tool did not return.',
  ].join(' ');
}

/** The KB chat's system prompt (SPEC-0062): answer from the knowledge base, cite what was read. */
export function kbChatSystem(id: ProjectIdentity = DEFAULT_IDENTITY): string {
  return [
    `You answer questions about the knowledge base of ${id.name} (Markdown documentation) for a developer.${about(id)}`,
    'Always search the knowledge base with your tools before answering, and read the relevant documents when you need their content or are asked for a summary.',
    'Answer only from what the tools returned; if nothing relevant is found, say so instead of guessing.',
    `Cite the documents you used by their path, written as ${kbPrefix(id)}<path>.`,
    'Be concise; use Markdown.',
  ].join(' ');
}

/** The storyboard assists' system prompt. */
export function storyboardSystem(id: ProjectIdentity = DEFAULT_IDENTITY): string {
  return [
    `You help business analysts document ${id.name} as storyboards: ordered steps${about(id) ? ` (${about(id).trim()})` : ''}`,
    'with a responsibility hand-off between lanes (actors, channels, systems, external parties).',
    'Answer with the requested format only. Do not invent identifiers.',
  ].join(' ');
}
