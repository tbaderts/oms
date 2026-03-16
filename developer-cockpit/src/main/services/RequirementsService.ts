import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type {
  UseCase,
  FunctionalRequirement,
  NonFunctionalRequirement,
  Actor,
} from '../../shared/types/requirements';

export class RequirementsService {
  constructor(private kbPath: string) {}

  getUseCases(): UseCase[] {
    return this.scanDocuments<UseCase>('use-cases', (frontmatter, content, source) => ({
      id: (frontmatter.id as string) || this.idFromFile(source),
      title: (frontmatter.title as string) || '',
      description: content.slice(0, 500),
      actors: (frontmatter.actors as string[]) || [],
      preconditions: (frontmatter.preconditions as string[]) || [],
      postconditions: (frontmatter.postconditions as string[]) || [],
      mainFlow: (frontmatter.mainFlow as string[]) || this.extractListSection(content, 'Main Flow'),
      alternativeFlows: (frontmatter.alternativeFlows as string[]) || this.extractListSection(content, 'Alternative'),
      source,
    }));
  }

  getFunctionalRequirements(): FunctionalRequirement[] {
    return this.scanDocuments<FunctionalRequirement>('functional-requirements', (frontmatter, content, source) => ({
      id: (frontmatter.id as string) || this.idFromFile(source),
      title: (frontmatter.title as string) || '',
      description: content.slice(0, 500),
      priority: (frontmatter.priority as FunctionalRequirement['priority']) || 'should',
      status: (frontmatter.status as FunctionalRequirement['status']) || 'draft',
      source,
    }));
  }

  getNonFunctionalRequirements(): NonFunctionalRequirement[] {
    return this.scanDocuments<NonFunctionalRequirement>('non-functional-requirements', (frontmatter, content, source) => ({
      id: (frontmatter.id as string) || this.idFromFile(source),
      title: (frontmatter.title as string) || '',
      description: content.slice(0, 500),
      category: (frontmatter.category as string) || 'general',
      metric: (frontmatter.metric as string) || '',
      target: (frontmatter.target as string) || '',
      source,
    }));
  }

  getActors(): Actor[] {
    return this.scanDocuments<Actor>('actors', (frontmatter, content, source) => ({
      id: (frontmatter.id as string) || this.idFromFile(source),
      name: (frontmatter.name as string) || (frontmatter.title as string) || '',
      type: (frontmatter.type as Actor['type']) || 'human',
      description: content.slice(0, 500),
      responsibilities: (frontmatter.responsibilities as string[]) || [],
      source,
    }));
  }

  private scanDocuments<T>(
    subdirectory: string,
    mapper: (frontmatter: Record<string, unknown>, content: string, source: string) => T,
  ): T[] {
    const results: T[] = [];
    const searchPaths = [
      path.join(this.kbPath, subdirectory),
      path.join(this.kbPath, 'oms-concepts', subdirectory),
      path.join(this.kbPath, 'oms-framework', subdirectory),
    ];

    for (const searchPath of searchPaths) {
      if (!fs.existsSync(searchPath)) continue;
      const files = fs.readdirSync(searchPath).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        try {
          const fullPath = path.join(searchPath, file);
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const { data, content } = matter(raw);
          results.push(mapper(data, content, fullPath));
        } catch {
          // Skip unreadable
        }
      }
    }

    // Also scan all .md files in the KB for frontmatter type matching
    if (results.length === 0) {
      this.scanAllForType(subdirectory, mapper, results);
    }

    return results;
  }

  private scanAllForType<T>(
    type: string,
    mapper: (frontmatter: Record<string, unknown>, content: string, source: string) => T,
    results: T[],
  ): void {
    const scanDir = (dirPath: string) => {
      if (!fs.existsSync(dirPath)) return;
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          scanDir(fullPath);
        } else if (entry.name.endsWith('.md')) {
          try {
            const raw = fs.readFileSync(fullPath, 'utf-8');
            const { data, content } = matter(raw);
            if (data.type === type || data.category === type) {
              results.push(mapper(data, content, fullPath));
            }
          } catch {
            // Skip
          }
        }
      }
    };
    scanDir(this.kbPath);
  }

  private idFromFile(filePath: string): string {
    return path.basename(filePath, '.md').replace(/\s+/g, '-').toLowerCase();
  }

  private extractListSection(content: string, heading: string): string[] {
    const regex = new RegExp(`##\\s*${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
    const match = content.match(regex);
    if (!match) return [];
    return match[1]
      .split('\n')
      .filter((line) => line.trim().startsWith('-') || line.trim().match(/^\d+\./))
      .map((line) => line.replace(/^[\s-]*\d*\.?\s*/, '').trim());
  }
}
