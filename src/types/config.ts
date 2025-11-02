/**
 * Configuration types for SCF
 */

export interface SCFConfig {
  app: string;
  region: string;
  s3?: S3Config;
  cloudfront?: CloudFrontConfig;
  environments?: Record<string, Partial<SCFConfig>>;
}

export interface S3Config {
  bucketName: string;
  buildDir: string;
  indexDocument?: string;
  errorDocument?: string;
}

export interface CloudFrontConfig {
  enabled: boolean;
  priceClass?: string;
  customDomain?: {
    domainName: string;
    certificateArn: string;
  };
}
