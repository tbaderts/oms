import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type {
  Actor,
  Capability,
  DocStatus,
  FunctionalRequirement,
  Implementation,
  Maturity,
  NonFunctionalRequirement,
  UseCase,
} from '../../shared/types/requirements';
import { ACTORS_DIR, CAPABILITIES_DIR, FR_DIR, NFR_DIR, USE_CASES_DIR } from './kbLayout';

interface Doc {
  data: Record<string, unknown>;
  content: string;
  source: string;
}

const REQUIREMENT_ID = /\b(N?FR-\d{3})\b/;
const USE_CASE_ID = /\b(UC-\d{3})\b/;

/**
 * Reads the capability catalogue of the knowledge base (SPEC-0061): capabilities, use cases,
 * actors and functional and non-functional requirements, each from its folder in `kbLayout`.
 */
export class RequirementsService {
  constructor(private kbPath: string) {}

  getCapabilities(): Capability[] {
    return this.scan(CAPABILITIES_DIR).map(({ data, content, source }) => ({
      id: idFromFile(source),
      title: str(data.title),
      description: str(data.description),
      maturity: (str(data.maturity) || 'planned') as Maturity,
      commands: strList(data.commands),
      useCases: linkedIds(content, USE_CASE_ID),
      requirements: linkedIds(content, REQUIREMENT_ID),
      status: (str(data.status) || 'draft') as DocStatus,
      source,
    }));
  }

  getUseCases(): UseCase[] {
    const actorNames = new Map(this.getActors().map((a) => [a.id, a.name]));
    return this.scan(USE_CASES_DIR).map(({ data, content, source }) => ({
      id: str(data.id) || idFromFile(source),
      title: str(data.title),
      description: str(data.description),
      actors: strList(data.actors).map((a) => actorNames.get(idFromFile(a)) ?? idFromFile(a)),
      capability: data.capability ? idFromFile(str(data.capability)) : '',
      preconditions: extractListSection(content, 'Preconditions'),
      postconditions: extractListSection(content, 'Postconditions'),
      mainFlow: extractListSection(content, 'Main Flow'),
      alternativeFlows: extractListSection(content, 'Alternative Flows'),
      requirements: linkedIds(content, REQUIREMENT_ID),
      source,
    }));
  }

  getFunctionalRequirements(): FunctionalRequirement[] {
    return this.scan(FR_DIR).map(({ data, content, source }) => ({
      id: str(data.id) || idFromFile(source),
      title: str(data.title),
      description: str(data.description) || content.slice(0, 500),
      priority: (str(data.priority) || 'should') as FunctionalRequirement['priority'],
      status: (str(data.status) || 'draft') as DocStatus,
      implementation: (str(data.implementation) || 'not-implemented') as Implementation,
      capability: data.capability ? idFromFile(str(data.capability)) : '',
      source,
    }));
  }

  getNonFunctionalRequirements(): NonFunctionalRequirement[] {
    return this.scan(NFR_DIR).map(({ data, content, source }) => ({
      id: str(data.id) || idFromFile(source),
      title: str(data.title),
      description: str(data.description) || content.slice(0, 500),
      category: str(data.category) || 'general',
      metric: str(data.metric),
      target: str(data.target),
      implementation: (str(data.implementation) || 'not-implemented') as Implementation,
      capability: data.capability ? idFromFile(str(data.capability)) : '',
      source,
    }));
  }

  getActors(): Actor[] {
    return this.scan(ACTORS_DIR).map(({ data, content, source }) => ({
      id: idFromFile(source),
      name: str(data.title) || idFromFile(source),
      kind: (str(data.kind) || 'human') as Actor['kind'],
      description: str(data.description) || content.slice(0, 500),
      responsibilities: extractListSection(content, 'Responsibilities'),
      source,
    }));
  }

  /** The concept documents directly in one layout folder (not `index.md`), sorted by file name. */
  private scan(folder: string): Doc[] {
    const dir = path.join(this.kbPath, ...folder.split('/'));
    if (!fs.existsSync(dir)) return [];
    const docs: Doc[] = [];
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'index.md').sort()) {
      const source = path.join(dir, file);
      try {
        const { data, content } = matter(fs.readFileSync(source, 'utf-8'));
        docs.push({ data, content, source });
      } catch {
        // an unreadable document is skipped; okf-check reports it
      }
    }
    return docs;
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const idFromFile = (filePath: string): string => path.basename(filePath, '.md');

/** Items (bullets or numbered) of the `## <heading>` section. */
function extractListSection(content: string, heading: string): string[] {
  const regex = new RegExp(`##\\s*${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  const match = content.match(regex);
  if (!match) return [];
  return match[1]
    .split('\n')
    .filter((line) => line.trim().startsWith('-') || /^\d+\./.test(line.trim()))
    .map((line) => line.replace(/^[\s-]*\d*\.?\s*/, '').trim());
}

/** Ids matched in the targets of markdown links, in order of first appearance, without duplicates. */
function linkedIds(content: string, idPattern: RegExp): string[] {
  const ids: string[] = [];
  for (const m of content.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const id = path.basename(m[1].replace(/[#?].*$/, '')).match(idPattern)?.[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
