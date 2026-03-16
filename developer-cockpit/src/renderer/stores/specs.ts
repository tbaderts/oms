import { create } from 'zustand';
import type {
  SpecFile,
  SpecValidationResult,
  CodeGenTask,
  CodeGenResult,
  DomainEntity,
} from '@shared/types/specs';

let validateTimer: ReturnType<typeof setTimeout> | null = null;

interface SpecsState {
  files: SpecFile[];
  selectedFile: SpecFile | null;
  fileContent: string;
  originalContent: string;
  dirty: boolean;
  validation: SpecValidationResult | null;
  codeGenTasks: CodeGenTask[];
  codeGenResults: Map<string, CodeGenResult>;
  runningTask: string | null;
  entities: DomainEntity[];
  error: string | null;
  loading: boolean;

  discoverFiles: () => Promise<void>;
  selectFile: (file: SpecFile) => Promise<void>;
  updateContent: (content: string) => void;
  saveFile: () => Promise<void>;
  loadCodeGenTasks: () => Promise<void>;
  runCodeGen: (taskId: string) => Promise<void>;
  runAllCodeGen: () => Promise<void>;
  loadEntities: () => Promise<void>;
}

export const useSpecsStore = create<SpecsState>((set, get) => ({
  files: [],
  selectedFile: null,
  fileContent: '',
  originalContent: '',
  dirty: false,
  validation: null,
  codeGenTasks: [],
  codeGenResults: new Map(),
  runningTask: null,
  entities: [],
  error: null,
  loading: false,

  discoverFiles: async () => {
    set({ loading: true, error: null });
    try {
      const files = await window.cockpit.specs.discoverFiles();
      set({ files, loading: false });
    } catch (e: unknown) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  selectFile: async (file: SpecFile) => {
    set({ loading: true, error: null });
    try {
      const content = await window.cockpit.specs.readFile(file.path);
      set({
        selectedFile: file,
        fileContent: content,
        originalContent: content,
        dirty: false,
        validation: null,
        loading: false,
      });
    } catch (e: unknown) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  updateContent: (content: string) => {
    const { originalContent, selectedFile } = get();
    set({ fileContent: content, dirty: content !== originalContent });

    if (validateTimer) clearTimeout(validateTimer);
    if (selectedFile) {
      const filePath = selectedFile.path;
      validateTimer = setTimeout(() => {
        window.cockpit.specs.validate(filePath, content).then((validation) => {
          // Only apply if still viewing the same file
          if (get().selectedFile?.path === filePath) {
            set({ validation });
          }
        });
      }, 500);
    }
  },

  saveFile: async () => {
    const { selectedFile, fileContent } = get();
    if (!selectedFile) return;
    set({ error: null });
    try {
      await window.cockpit.specs.writeFile(selectedFile.path, fileContent);
      set({ originalContent: fileContent, dirty: false });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  loadCodeGenTasks: async () => {
    try {
      const codeGenTasks = await window.cockpit.specs.getCodeGenTasks();
      set({ codeGenTasks });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  runCodeGen: async (taskId: string) => {
    set({ runningTask: taskId, error: null });
    try {
      const result = await window.cockpit.specs.runCodeGen(taskId);
      const results = new Map(get().codeGenResults);
      results.set(taskId, result);
      set({ codeGenResults: results, runningTask: null });
    } catch (e: unknown) {
      set({ runningTask: null, error: e instanceof Error ? e.message : String(e) });
    }
  },

  runAllCodeGen: async () => {
    const { codeGenTasks } = get();
    for (const task of codeGenTasks) {
      await get().runCodeGen(task.id);
    }
  },

  loadEntities: async () => {
    set({ loading: true, error: null });
    try {
      const entities = await window.cockpit.specs.parseEntities();
      set({ entities, loading: false });
    } catch (e: unknown) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
