/**
 * File state tracking
 *
 * Compares file hashes to detect changes for incremental deployment.
 */

import type {
  FileHashMap,
  FileChange,
  FileChanges,
  DeploymentState,
} from "../../types/state.js";
import type { FileInfo } from "../../types/deployer.js";

/**
 * Compare file hashes between current and previous state
 */
export function compareFileHashes(
  currentFiles: FileInfo[],
  previousHashes: FileHashMap
): FileChanges {
  const added: FileChange[] = [];
  const modified: FileChange[] = [];
  const unchanged: FileChange[] = [];
  const deleted: FileChange[] = [];

  // Track current file paths
  const currentPaths = new Set<string>();

  // Check current files
  for (const file of currentFiles) {
    const { key, hash } = file;
    currentPaths.add(key);

    const previousHash = previousHashes[key];

    if (!previousHash) {
      // New file
      added.push({
        path: key,
        hash,
        status: "added",
      });
    } else if (previousHash !== hash) {
      // Modified file
      modified.push({
        path: key,
        hash,
        status: "modified",
        previousHash,
      });
    } else {
      // Unchanged file
      unchanged.push({
        path: key,
        hash,
        status: "unchanged",
        previousHash,
      });
    }
  }

  // Check for deleted files
  for (const [path, hash] of Object.entries(previousHashes)) {
    if (!currentPaths.has(path)) {
      deleted.push({
        path,
        hash,
        status: "deleted",
        previousHash: hash,
      });
    }
  }

  return {
    added,
    modified,
    unchanged,
    deleted,
    totalChanges: added.length + modified.length + deleted.length,
  };
}

/**
 * Get files that need to be uploaded (added + modified)
 */
export function getFilesToUpload(
  currentFiles: FileInfo[],
  previousHashes: FileHashMap
): FileInfo[] {
  const changes = compareFileHashes(currentFiles, previousHashes);

  // Get paths of files to upload
  const pathsToUpload = new Set([
    ...changes.added.map((f) => f.path),
    ...changes.modified.map((f) => f.path),
  ]);

  // Filter current files
  return currentFiles.filter((file) => pathsToUpload.has(file.key));
}

/**
 * Update file hashes in state
 */
export function updateFileHashes(
  state: DeploymentState,
  files: FileInfo[]
): DeploymentState {
  const newHashes: FileHashMap = {};

  for (const file of files) {
    newHashes[file.key] = file.hash;
  }

  return {
    ...state,
    files: newHashes,
  };
}

/**
 * Merge file hashes (add/update only, don't remove)
 */
export function mergeFileHashes(
  state: DeploymentState,
  files: FileInfo[]
): DeploymentState {
  const mergedHashes: FileHashMap = {
    ...state.files,
  };

  for (const file of files) {
    mergedHashes[file.key] = file.hash;
  }

  return {
    ...state,
    files: mergedHashes,
  };
}

/**
 * Remove deleted files from state
 */
export function removeDeletedFiles(
  state: DeploymentState,
  deletedPaths: string[]
): DeploymentState {
  const newHashes: FileHashMap = { ...state.files };

  for (const path of deletedPaths) {
    delete newHashes[path];
  }

  return {
    ...state,
    files: newHashes,
  };
}

/**
 * Get file hash from state
 */
export function getFileHash(
  state: DeploymentState,
  filePath: string
): string | undefined {
  return state.files[filePath];
}

/**
 * Check if file exists in state
 */
export function hasFile(state: DeploymentState, filePath: string): boolean {
  return filePath in state.files;
}

/**
 * Get all file paths from state
 */
export function getFilePaths(state: DeploymentState): string[] {
  return Object.keys(state.files);
}

/**
 * Get file count from state
 */
export function getFileCount(state: DeploymentState): number {
  return Object.keys(state.files).length;
}

/**
 * Create file hash map from FileInfo array
 */
export function createFileHashMap(files: FileInfo[]): FileHashMap {
  const hashMap: FileHashMap = {};

  for (const file of files) {
    hashMap[file.key] = file.hash;
  }

  return hashMap;
}

/**
 * Format file changes for display
 */
export function formatFileChanges(changes: FileChanges): string {
  const lines: string[] = [];

  if (changes.added.length > 0) {
    lines.push(`✓ Added: ${changes.added.length} files`);
  }

  if (changes.modified.length > 0) {
    lines.push(`✓ Modified: ${changes.modified.length} files`);
  }

  if (changes.deleted.length > 0) {
    lines.push(`✓ Deleted: ${changes.deleted.length} files`);
  }

  if (changes.unchanged.length > 0) {
    lines.push(`○ Unchanged: ${changes.unchanged.length} files`);
  }

  return lines.join("\n");
}

/**
 * Calculate incremental deployment stats
 */
export function getIncrementalStats(changes: FileChanges): {
  needsUpload: number;
  canSkip: number;
  needsDelete: number;
  totalChanges: number;
} {
  return {
    needsUpload: changes.added.length + changes.modified.length,
    canSkip: changes.unchanged.length,
    needsDelete: changes.deleted.length,
    totalChanges: changes.totalChanges,
  };
}
