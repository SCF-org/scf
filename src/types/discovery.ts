/**
 * Resource discovery types
 * Types for discovering and managing AWS resources via tags
 */

/**
 * Discovered S3 bucket resource
 */
export interface DiscoveredS3Resource {
  bucketName: string;
  region: string;
  app: string;
  environment: string;
  tags: Record<string, string>;
}

/**
 * Discovered CloudFront distribution resource
 */
export interface DiscoveredCloudFrontResource {
  distributionId: string;
  distributionArn: string;
  domainName: string;
  status: string;
  app: string;
  environment: string;
  tags: Record<string, string>;
}

/**
 * Discovered ACM certificate resource
 */
export interface DiscoveredACMResource {
  certificateArn: string;
  domainName: string;
  status: string;
  alternativeNames?: string[];
  app?: string;
  environment?: string;
  tags: Record<string, string>;
}

/**
 * Discovered Route53 hosted zone resource
 */
export interface DiscoveredRoute53Resource {
  hostedZoneId: string;
  hostedZoneName: string;
  nameServers: string[];
  app?: string;
  environment?: string;
  tags: Record<string, string>;
}

/**
 * All discovered resources for an app/environment
 */
export interface DiscoveredResources {
  s3?: DiscoveredS3Resource;
  cloudfront?: DiscoveredCloudFrontResource;
  acm?: DiscoveredACMResource;
  route53?: DiscoveredRoute53Resource;
  hasResources: boolean;
}

/**
 * Resource discovery options
 */
export interface ResourceDiscoveryOptions {
  app?: string;
  environment?: string;
  region: string;
}
