/**
 * State management types
 */

/**
 * S3 resource state
 */
export interface S3ResourceState {
  bucketName: string;
  region: string;
  websiteUrl?: string;
}

/**
 * CloudFront resource state
 */
export interface CloudFrontResourceState {
  distributionId: string;
  domainName: string;
  distributionUrl: string;
  aliases?: string[];
}

/**
 * AWS resources state
 */
export interface ResourcesState {
  s3?: S3ResourceState;
  cloudfront?: CloudFrontResourceState;
}

/**
 * File hash map (path -> hash)
 */
export interface FileHashMap {
  [filePath: string]: string;
}

/**
 * Deployment state
 */
export interface DeploymentState {
  app: string;
  environment: string;
  lastDeployed: string; // ISO 8601 timestamp
  resources: ResourcesState;
  files: FileHashMap;
  version?: string; // State format version
}

/**
 * File change detection result
 */
export interface FileChange {
  path: string;
  hash: string;
  status: "added" | "modified" | "unchanged" | "deleted";
  previousHash?: string;
}

/**
 * File changes summary
 */
export interface FileChanges {
  added: FileChange[];
  modified: FileChange[];
  unchanged: FileChange[];
  deleted: FileChange[];
  totalChanges: number;
}

/**
 * State file options
 */
export interface StateOptions {
  stateDir?: string; // State directory (default: .deploy)
  environment?: string; // Environment name
}

/**
 * State manager options
 */
export interface StateManagerOptions {
  stateDir?: string;
  createIfMissing?: boolean;
}
