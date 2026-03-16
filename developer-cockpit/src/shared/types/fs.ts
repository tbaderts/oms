export interface FsEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  extension: string;
  size: number;
}

export interface FsStat {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  created: number;
  modified: number;
}
