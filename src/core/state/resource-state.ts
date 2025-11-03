/**
 * Resource state management
 *
 * Tracks AWS resource metadata (S3 buckets, CloudFront distributions).
 */

import type {
  DeploymentState,
  S3ResourceState,
  CloudFrontResourceState,
  ResourcesState,
} from '../../types/state.js';

/**
 * Update S3 resource state
 */
export function updateS3Resource(
  state: DeploymentState,
  resource: S3ResourceState
): DeploymentState {
  return {
    ...state,
    resources: {
      ...state.resources,
      s3: resource,
    },
  };
}

/**
 * Update CloudFront resource state
 */
export function updateCloudFrontResource(
  state: DeploymentState,
  resource: CloudFrontResourceState
): DeploymentState {
  return {
    ...state,
    resources: {
      ...state.resources,
      cloudfront: resource,
    },
  };
}

/**
 * Update both S3 and CloudFront resources
 */
export function updateResources(
  state: DeploymentState,
  resources: ResourcesState
): DeploymentState {
  return {
    ...state,
    resources: {
      ...state.resources,
      ...resources,
    },
  };
}

/**
 * Get S3 resource state
 */
export function getS3Resource(
  state: DeploymentState
): S3ResourceState | undefined {
  return state.resources.s3;
}

/**
 * Get CloudFront resource state
 */
export function getCloudFrontResource(
  state: DeploymentState
): CloudFrontResourceState | undefined {
  return state.resources.cloudfront;
}

/**
 * Check if S3 resource exists in state
 */
export function hasS3Resource(state: DeploymentState): boolean {
  return !!state.resources.s3;
}

/**
 * Check if CloudFront resource exists in state
 */
export function hasCloudFrontResource(state: DeploymentState): boolean {
  return !!state.resources.cloudfront;
}

/**
 * Remove S3 resource from state
 */
export function removeS3Resource(state: DeploymentState): DeploymentState {
  const newResources = { ...state.resources };
  delete newResources.s3;

  return {
    ...state,
    resources: newResources,
  };
}

/**
 * Remove CloudFront resource from state
 */
export function removeCloudFrontResource(
  state: DeploymentState
): DeploymentState {
  const newResources = { ...state.resources };
  delete newResources.cloudfront;

  return {
    ...state,
    resources: newResources,
  };
}

/**
 * Clear all resources from state
 */
export function clearResources(state: DeploymentState): DeploymentState {
  return {
    ...state,
    resources: {},
  };
}

/**
 * Create S3 resource state from deployment stats
 */
export function createS3ResourceState(
  bucketName: string,
  region: string,
  websiteUrl?: string
): S3ResourceState {
  return {
    bucketName,
    region,
    websiteUrl,
  };
}

/**
 * Create CloudFront resource state
 */
export function createCloudFrontResourceState(
  distributionId: string,
  domainName: string,
  distributionUrl: string,
  aliases?: string[]
): CloudFrontResourceState {
  return {
    distributionId,
    domainName,
    distributionUrl,
    aliases,
  };
}

/**
 * Get resource summary for display
 */
export function getResourceSummary(state: DeploymentState): {
  hasS3: boolean;
  hasCloudFront: boolean;
  s3BucketName?: string;
  s3Region?: string;
  distributionId?: string;
  distributionUrl?: string;
} {
  const s3 = getS3Resource(state);
  const cloudfront = getCloudFrontResource(state);

  return {
    hasS3: !!s3,
    hasCloudFront: !!cloudfront,
    s3BucketName: s3?.bucketName,
    s3Region: s3?.region,
    distributionId: cloudfront?.distributionId,
    distributionUrl: cloudfront?.distributionUrl,
  };
}

/**
 * Format resource summary for display
 */
export function formatResourceSummary(state: DeploymentState): string {
  const summary = getResourceSummary(state);
  const lines: string[] = [];

  lines.push(`App: ${state.app}`);
  lines.push(`Environment: ${state.environment}`);
  lines.push(`Last Deployed: ${new Date(state.lastDeployed).toLocaleString()}`);
  lines.push('');

  if (summary.hasS3) {
    lines.push('S3 Bucket:');
    lines.push(`  Name: ${summary.s3BucketName}`);
    lines.push(`  Region: ${summary.s3Region}`);

    const s3 = getS3Resource(state);
    if (s3?.websiteUrl) {
      lines.push(`  URL: ${s3.websiteUrl}`);
    }

    lines.push('');
  }

  if (summary.hasCloudFront) {
    lines.push('CloudFront Distribution:');
    lines.push(`  ID: ${summary.distributionId}`);
    lines.push(`  URL: ${summary.distributionUrl}`);

    const cf = getCloudFrontResource(state);
    if (cf?.aliases && cf.aliases.length > 0) {
      lines.push(`  Aliases: ${cf.aliases.join(', ')}`);
    }

    lines.push('');
  }

  const fileCount = Object.keys(state.files).length;
  lines.push(`Files: ${fileCount} tracked`);

  return lines.join('\n');
}

/**
 * Check if state has any resources
 */
export function hasAnyResource(state: DeploymentState): boolean {
  return hasS3Resource(state) || hasCloudFrontResource(state);
}

/**
 * Get all resource identifiers for cleanup
 */
export function getResourceIdentifiers(state: DeploymentState): {
  s3BucketName?: string;
  s3Region?: string;
  distributionId?: string;
} {
  const s3 = getS3Resource(state);
  const cloudfront = getCloudFrontResource(state);

  return {
    s3BucketName: s3?.bucketName,
    s3Region: s3?.region,
    distributionId: cloudfront?.distributionId,
  };
}

/**
 * Validate resource state consistency
 */
export function validateResourceState(state: DeploymentState): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check S3 resource
  const s3 = getS3Resource(state);
  if (s3) {
    if (!s3.bucketName) {
      errors.push('S3 resource missing bucketName');
    }
    if (!s3.region) {
      errors.push('S3 resource missing region');
    }
  }

  // Check CloudFront resource
  const cloudfront = getCloudFrontResource(state);
  if (cloudfront) {
    if (!cloudfront.distributionId) {
      errors.push('CloudFront resource missing distributionId');
    }
    if (!cloudfront.domainName) {
      errors.push('CloudFront resource missing domainName');
    }
    if (!cloudfront.distributionUrl) {
      errors.push('CloudFront resource missing distributionUrl');
    }
  }

  // Check basic state fields
  if (!state.app) {
    errors.push('State missing app name');
  }
  if (!state.environment) {
    errors.push('State missing environment');
  }
  if (!state.lastDeployed) {
    errors.push('State missing lastDeployed timestamp');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
