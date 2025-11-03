/**
 * State management module
 *
 * Handles deployment state tracking for incremental deployments
 * and resource cleanup.
 */

// State file manager
export {
  getStateFilePath,
  stateExists,
  loadState,
  saveState,
  deleteState,
  initializeState,
  getOrCreateState,
  listStateFiles,
  getStateDir,
  ensureStateDir,
  DEFAULT_STATE_DIR,
  STATE_VERSION,
} from './manager.js';

// File state tracking
export {
  compareFileHashes,
  getFilesToUpload,
  updateFileHashes,
  mergeFileHashes,
  removeDeletedFiles,
  getFileHash,
  hasFile,
  getFilePaths,
  getFileCount,
  createFileHashMap,
  formatFileChanges,
  getIncrementalStats,
} from './file-state.js';

// Resource state management
export {
  updateS3Resource,
  updateCloudFrontResource,
  updateResources,
  getS3Resource,
  getCloudFrontResource,
  hasS3Resource,
  hasCloudFrontResource,
  removeS3Resource,
  removeCloudFrontResource,
  clearResources,
  createS3ResourceState,
  createCloudFrontResourceState,
  getResourceSummary,
  formatResourceSummary,
  hasAnyResource,
  getResourceIdentifiers,
  validateResourceState,
} from './resource-state.js';

// Re-export types
export type {
  DeploymentState,
  S3ResourceState,
  CloudFrontResourceState,
  ResourcesState,
  FileHashMap,
  FileChange,
  FileChanges,
  StateOptions,
  StateManagerOptions,
} from '../../types/state.js';
