import { describe, it, expect } from "@jest/globals";
import {
  validateConfig,
  validateConfigSafe,
  configSchema,
} from "../../../core/config/schema.js";

describe("Config Schema Validation", () => {
  describe("validateConfig - valid configurations", () => {
    it("should validate a minimal valid config", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: {
          bucketName: "test-bucket",
          buildDir: "./dist",
        },
      };

      expect(() => validateConfig(config)).not.toThrow();
      const result = validateConfig(config);
      expect(result.app).toBe("test-app");
      expect(result.region).toBe("us-east-1");
    });

    it("should validate a full config with CloudFront", () => {
      const config = {
        app: "test-app-full",
        region: "ap-northeast-2",
        s3: {
          bucketName: "test-bucket-full",
          buildDir: "./dist",
          indexDocument: "index.html",
          errorDocument: "404.html",
        },
        cloudfront: {
          enabled: true,
          priceClass: "PriceClass_100" as const,
          customDomain: {
            domainName: "example.com",
            certificateArn:
              "arn:aws:acm:us-east-1:123456789012:certificate/test",
          },
        },
      };

      expect(() => validateConfig(config)).not.toThrow();
      const result = validateConfig(config);
      expect(result.cloudfront?.enabled).toBe(true);
    });

    it("should apply default values", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: {
          bucketName: "test-bucket",
          buildDir: "./dist",
        },
      };

      const result = validateConfig(config);
      expect(result.s3?.indexDocument).toBe("index.html");
      expect(result.s3?.websiteHosting).toBe(true);
      expect(result.s3?.concurrency).toBe(10);
      expect(result.s3?.gzip).toBe(true);
    });
  });

  describe("validateConfig - app name validation", () => {
    it("should reject app name with uppercase letters", () => {
      const config = {
        app: "TestApp",
        region: "us-east-1",
        s3: { bucketName: "test-bucket", buildDir: "./dist" },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it("should reject app name with underscores", () => {
      const config = {
        app: "test_app",
        region: "us-east-1",
        s3: { bucketName: "test-bucket", buildDir: "./dist" },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it("should reject app name with special characters", () => {
      const config = {
        app: "test@app!",
        region: "us-east-1",
        s3: { bucketName: "test-bucket", buildDir: "./dist" },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it("should accept app name with hyphens", () => {
      const config = {
        app: "test-app-name",
        region: "us-east-1",
        s3: { bucketName: "test-bucket", buildDir: "./dist" },
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    it("should reject empty app name", () => {
      const config = {
        app: "",
        region: "us-east-1",
        s3: { bucketName: "test-bucket", buildDir: "./dist" },
      };

      expect(() => validateConfig(config)).toThrow();
    });
  });

  describe("validateConfig - region validation", () => {
    it("should accept valid AWS regions", () => {
      const validRegions = [
        "us-east-1",
        "us-west-2",
        "eu-west-1",
        "ap-northeast-2",
        "ap-south-1",
      ];

      validRegions.forEach((region) => {
        const config = {
          app: "test-app",
          region,
          s3: { bucketName: "test-bucket", buildDir: "./dist" },
        };
        expect(() => validateConfig(config)).not.toThrow();
      });
    });

    it("should reject invalid region format", () => {
      const invalidRegions = [
        "us-east",
        "invalid-region",
        "us_east_1",
        "US-EAST-1",
      ];

      invalidRegions.forEach((region) => {
        const config = {
          app: "test-app",
          region,
          s3: { bucketName: "test-bucket", buildDir: "./dist" },
        };
        expect(() => validateConfig(config)).toThrow();
      });
    });
  });

  describe("validateConfig - S3 bucket name validation", () => {
    it("should accept valid bucket names", () => {
      const validBucketNames = [
        "my-bucket",
        "my-bucket-123",
        "my.bucket.name",
        "my-bucket.with-dots",
      ];

      validBucketNames.forEach((bucketName) => {
        const config = {
          app: "test-app",
          region: "us-east-1",
          s3: { bucketName, buildDir: "./dist" },
        };
        expect(() => validateConfig(config)).not.toThrow();
      });
    });

    it("should reject bucket names with uppercase letters", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: { bucketName: "MyBucket", buildDir: "./dist" },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it("should reject bucket names with underscores", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: { bucketName: "my_bucket", buildDir: "./dist" },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it("should reject bucket names that are too short", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: { bucketName: "ab", buildDir: "./dist" },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it("should reject bucket names that are too long", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: {
          bucketName: "a".repeat(64),
          buildDir: "./dist",
        },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it("should reject bucket names starting with hyphen", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: { bucketName: "-my-bucket", buildDir: "./dist" },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it("should reject bucket names ending with hyphen", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: { bucketName: "my-bucket-", buildDir: "./dist" },
      };

      expect(() => validateConfig(config)).toThrow();
    });
  });

  describe("validateConfig - CloudFront configuration", () => {
    it("should accept valid price classes", () => {
      const priceClasses = [
        "PriceClass_100",
        "PriceClass_200",
        "PriceClass_All",
      ] as const;

      priceClasses.forEach((priceClass) => {
        const config = {
          app: "test-app",
          region: "us-east-1",
          s3: { bucketName: "test-bucket", buildDir: "./dist" },
          cloudfront: {
            enabled: true,
            priceClass,
          },
        };
        expect(() => validateConfig(config)).not.toThrow();
      });
    });

    it("should reject invalid price class", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: { bucketName: "test-bucket", buildDir: "./dist" },
        cloudfront: {
          enabled: true,
          priceClass: "InvalidPriceClass",
        },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it("should validate certificate ARN format", () => {
      const validConfig = {
        app: "test-app",
        region: "us-east-1",
        s3: { bucketName: "test-bucket", buildDir: "./dist" },
        cloudfront: {
          enabled: true,
          customDomain: {
            domainName: "example.com",
            certificateArn:
              "arn:aws:acm:us-east-1:123456789012:certificate/abc123",
          },
        },
      };

      expect(() => validateConfig(validConfig)).not.toThrow();
    });

    it("should reject invalid certificate ARN", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: { bucketName: "test-bucket", buildDir: "./dist" },
        cloudfront: {
          enabled: true,
          customDomain: {
            domainName: "example.com",
            certificateArn: "invalid-arn",
          },
        },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it("should validate SPA and IPv6 options", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: { bucketName: "test-bucket", buildDir: "./dist" },
        cloudfront: {
          enabled: true,
          spa: true,
          ipv6: true,
        },
      };

      expect(() => validateConfig(config)).not.toThrow();
    });
  });

  describe("validateConfigSafe - safe parsing", () => {
    it("should return success for valid config", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: { bucketName: "test-bucket", buildDir: "./dist" },
      };

      const result = validateConfigSafe(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.app).toBe("test-app");
      }
    });

    it("should return error for invalid config", () => {
      const config = {
        app: "Invalid_App_Name",
        region: "us-east-1",
        s3: { bucketName: "test-bucket", buildDir: "./dist" },
      };

      const result = validateConfigSafe(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it("should provide detailed error messages", () => {
      const config = {
        app: "",
        region: "invalid",
        s3: { bucketName: "AB", buildDir: "" },
      };

      const result = validateConfigSafe(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe("validateConfig - required fields", () => {
    it("should reject config without app name", () => {
      const config = {
        region: "us-east-1",
        s3: { bucketName: "test-bucket", buildDir: "./dist" },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it("should reject config without region", () => {
      const config = {
        app: "test-app",
        s3: { bucketName: "test-bucket", buildDir: "./dist" },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it("should reject S3 config without bucket name", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: { buildDir: "./dist" },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it("should accept S3 config without build directory (auto-detection)", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: { bucketName: "test-bucket" },
      };

      expect(() => validateConfig(config)).not.toThrow();
    });
  });

  describe("validateConfig - concurrency limits", () => {
    it("should accept valid concurrency values", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: {
          bucketName: "test-bucket",
          buildDir: "./dist",
          concurrency: 50,
        },
      };

      expect(() => validateConfig(config)).not.toThrow();
    });

    it("should reject concurrency less than 1", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: {
          bucketName: "test-bucket",
          buildDir: "./dist",
          concurrency: 0,
        },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it("should reject concurrency greater than 100", () => {
      const config = {
        app: "test-app",
        region: "us-east-1",
        s3: {
          bucketName: "test-bucket",
          buildDir: "./dist",
          concurrency: 101,
        },
      };

      expect(() => validateConfig(config)).toThrow();
    });
  });
});
