/**
 * Zod schemas for SCF configuration validation
 */

import { z } from "zod";
import type { SCFConfig } from "../../types/config.js";

/**
 * AWS credentials schema
 */
const awsCredentialsSchema = z
  .object({
    profile: z.string().optional(),
    accessKeyId: z.string().optional(),
    secretAccessKey: z.string().optional(),
    sessionToken: z.string().optional(),
  })
  .optional();

/**
 * S3 configuration schema
 */
const s3ConfigSchema = z
  .object({
    bucketName: z
      .string()
      .min(3, "Bucket name must be at least 3 characters")
      .max(63, "Bucket name must be at most 63 characters")
      .regex(
        /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/,
        "Bucket name must follow S3 naming rules"
      ),
    buildDir: z
      .string()
      .min(1, "Build directory cannot be empty")
      .optional(),
    indexDocument: z.string().default("index.html"),
    errorDocument: z.string().optional(),
    websiteHosting: z.boolean().default(true),
    concurrency: z.number().int().min(1).max(100).default(10),
    gzip: z.boolean().default(true),
    exclude: z.array(z.string()).default([]),
  })
  .optional();

/**
 * CloudFront error pages schema
 */
const errorPageSchema = z.object({
  errorCode: z.number().int().min(400).max(599),
  responseCode: z.number().int().min(200).max(599).optional(),
  responsePath: z.string().optional(),
  cacheTTL: z.number().int().min(0).optional(),
});

/**
 * CloudFront configuration schema
 */
const cloudfrontConfigSchema = z
  .object({
    enabled: z.boolean(),
    priceClass: z
      .enum(["PriceClass_100", "PriceClass_200", "PriceClass_All"])
      .optional()
      .default("PriceClass_100"),
    customDomain: z
      .object({
        domainName: z.string().min(1, "Domain name is required"),
        certificateArn: z
          .string()
          .regex(/^arn:aws:acm:/, "Must be a valid ACM certificate ARN"),
        aliases: z.array(z.string()).optional(),
      })
      .optional(),
    defaultTTL: z.number().int().min(0).default(86400), // 1 day
    maxTTL: z.number().int().min(0).default(31536000), // 1 year
    minTTL: z.number().int().min(0).default(0),
    ipv6: z.boolean().default(true),
    errorPages: z.array(errorPageSchema).optional(),
  })
  .optional();

/**
 * Main SCF configuration schema
 */
export const configSchema: z.ZodType<SCFConfig> = z.object({
  app: z
    .string()
    .min(1, "App name is required")
    .regex(
      /^[a-z0-9-]+$/,
      "App name must contain only lowercase letters, numbers, and hyphens"
    ),
  region: z
    .string()
    .min(1, "AWS region is required")
    .regex(
      /^[a-z]{2}-[a-z]+-\d+$/,
      "Must be a valid AWS region (e.g., us-east-1)"
    ),
  credentials: awsCredentialsSchema,
  s3: s3ConfigSchema,
  cloudfront: cloudfrontConfigSchema,
  environments: z.record(z.string(), z.any()).optional(),
});

/**
 * Load config options schema
 */
export const loadConfigOptionsSchema = z.object({
  configPath: z.string().optional(),
  env: z.string().optional(),
  profile: z.string().optional(),
});

/**
 * Validate config and return typed result
 */
export function validateConfig(config: unknown) {
  return configSchema.parse(config);
}

/**
 * Validate config with safe parsing (returns result object)
 */
export function validateConfigSafe(config: unknown) {
  return configSchema.safeParse(config);
}
