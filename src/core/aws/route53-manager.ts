/**
 * Route53 Manager
 * Handles DNS record management for domain validation and CloudFront aliases
 */

import {
  Route53Client,
  ListHostedZonesCommand,
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
  type CreateHostedZoneRequest,
  GetHostedZoneCommand,
  ChangeTagsForResourceCommand,
  DeleteHostedZoneCommand,
  ListResourceRecordSetsCommand,
  type HostedZone,
  type Change,
  ChangeAction,
  RRType,
} from "@aws-sdk/client-route-53";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import chalk from "chalk";
import ora from "ora";
import type { CertificateValidationRecord } from "./acm-manager.js";

/**
 * Route53 Manager options
 */
export interface Route53ManagerOptions {
  region?: string;
  credentials?: AwsCredentialIdentityProvider;
}

/**
 * DNS record to create
 */
export interface DnsRecord {
  name: string;
  type: string;
  value: string;
  ttl?: number;
}

/**
 * Route53 Manager for DNS operations
 */
export class Route53Manager {
  private client: Route53Client;

  constructor(options: Route53ManagerOptions = {}) {
    this.client = new Route53Client({
      region: options.region || "us-east-1",
      credentials: options.credentials,
    });
  }

  /**
   * Create A and AAAA Alias records pointing to a CloudFront distribution
   * Uses CloudFront's global hosted zone id: Z2FDTNDATAQYW2
   */
  async createCloudFrontAliasRecords(
    hostedZoneId: string,
    domain: string,
    cloudfrontDomain: string
  ): Promise<void> {
    const spinner = ora(
      `Creating A/AAAA Alias records for ${domain} → ${cloudfrontDomain}...`
    ).start();

    // CloudFront global hosted zone ID
    const CLOUDFRONT_ZONE_ID = "Z2FDTNDATAQYW2";

    try {
      const fqdn = domain.endsWith(".") ? domain : `${domain}.`;
      const cfDomain = cloudfrontDomain.endsWith(".")
        ? cloudfrontDomain
        : `${cloudfrontDomain}.`;

      const changes: Change[] = [RRType.A, RRType.AAAA].map((rrtype) => ({
        Action: ChangeAction.UPSERT,
        ResourceRecordSet: {
          Name: fqdn,
          Type: rrtype,
          AliasTarget: {
            DNSName: cfDomain,
            HostedZoneId: CLOUDFRONT_ZONE_ID,
            EvaluateTargetHealth: false,
          },
        },
      }));

      await this.client.send(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: hostedZoneId,
          ChangeBatch: {
            Comment: `CloudFront A/AAAA alias for ${domain} created by scf-deploy`,
            Changes: changes,
          },
        })
      );

      spinner.succeed(`Created A/AAAA Alias records for ${domain}`);
    } catch (error) {
      spinner.fail("Failed to create CloudFront Alias records");
      throw new Error(
        `Alias record creation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Fetch NS records (delegation set) for a hosted zone
   */
  async getNameServers(hostedZoneId: string): Promise<string[]> {
    const id = this.extractHostedZoneId(hostedZoneId);
    try {
      const { DelegationSet } = await this.client.send(
        new GetHostedZoneCommand({ Id: id })
      );
      return DelegationSet?.NameServers || [];
    } catch (_error) {
      return [];
    }
  }

  /**
   * Create a public hosted zone for a domain (if it does not already exist)
   * Returns the created hosted zone object
   */
  private async createHostedZone(
    domain: string,
    app?: string,
    environment?: string
  ): Promise<HostedZone> {
    // Ensure trailing dot per Route53 expectation
    const zoneName = domain.endsWith(".") ? domain : `${domain}.`;

    const spinner = ora(
      `Creating Route53 hosted zone for ${domain}...`
    ).start();

    try {
      const callerReference = `scf-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;

      const input: CreateHostedZoneRequest = {
        Name: zoneName,
        CallerReference: callerReference,
        HostedZoneConfig: {
          Comment: "Hosted zone created by scf-deploy",
          PrivateZone: false,
        },
      };

      const { HostedZone, DelegationSet } = await this.client.send(
        new CreateHostedZoneCommand(input)
      );

      if (!HostedZone || !HostedZone.Id) {
        throw new Error("CreateHostedZone returned no HostedZone");
      }

      // Add tags to the hosted zone
      try {
        const tags = [
          { Key: "scf:managed", Value: "true" },
          { Key: "scf:tool", Value: "scf-deploy" },
          { Key: "scf:domain", Value: domain },
        ];

        // Add app and environment tags if provided
        if (app) {
          tags.push({ Key: "scf:app", Value: app });
        }
        if (environment) {
          tags.push({ Key: "scf:environment", Value: environment });
        }

        await this.client.send(
          new ChangeTagsForResourceCommand({
            ResourceType: "hostedzone",
            ResourceId: HostedZone.Id.replace("/hostedzone/", ""),
            AddTags: tags,
          })
        );
      } catch (_tagError) {
        // Non-critical error, just log it
        console.warn("Warning: Failed to add tags to hosted zone");
      }

      spinner.succeed(`Hosted zone created: ${HostedZone.Id || zoneName}`);

      if (DelegationSet?.NameServers && DelegationSet.NameServers.length > 0) {
        console.log();
        console.log(
          chalk.gray("   Name servers (update at your domain registrar):")
        );
        for (const ns of DelegationSet.NameServers) {
          console.log(chalk.gray(`   - ${ns}`));
        }
        console.log();
      }

      return HostedZone;
    } catch (error) {
      spinner.fail("Failed to create Route53 hosted zone");
      throw new Error(
        `Hosted zone creation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Find hosted zone for a domain
   * Supports both apex domains (example.com) and subdomains (www.example.com)
   */
  async findHostedZone(domain: string): Promise<HostedZone | null> {
    try {
      const { HostedZones } = await this.client.send(
        new ListHostedZonesCommand({})
      );

      if (!HostedZones || HostedZones.length === 0) {
        return null;
      }

      // Normalize domain (remove trailing dot if present)
      const normalizedDomain = domain.endsWith(".") ? domain : `${domain}.`;

      // First, try exact match
      for (const zone of HostedZones) {
        if (zone.Name === normalizedDomain) {
          return zone;
        }
      }

      // If no exact match, find the best matching parent zone
      // For subdomain.example.com, find example.com zone
      const parts = domain.split(".");
      for (let i = 0; i < parts.length - 1; i++) {
        const parentDomain = parts.slice(i).join(".");
        const normalizedParent = parentDomain.endsWith(".")
          ? parentDomain
          : `${parentDomain}.`;

        for (const zone of HostedZones) {
          if (zone.Name === normalizedParent) {
            return zone;
          }
        }
      }

      return null;
    } catch (error) {
      throw new Error(
        `Failed to find hosted zone for ${domain}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Create DNS validation records for ACM certificate
   */
  async createValidationRecords(
    hostedZoneId: string,
    validationRecords: CertificateValidationRecord[]
  ): Promise<void> {
    if (validationRecords.length === 0) {
      throw new Error("No validation records provided");
    }

    const spinner = ora("Creating DNS validation records...").start();

    try {
      const changes: Change[] = validationRecords.map((record) => ({
        Action: ChangeAction.UPSERT,
        ResourceRecordSet: {
          Name: record.name,
          Type: record.type as RRType,
          TTL: 300,
          ResourceRecords: [{ Value: record.value }],
        },
      }));

      await this.client.send(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: hostedZoneId,
          ChangeBatch: {
            Comment: "ACM certificate validation records created by scf-deploy",
            Changes: changes,
          },
        })
      );

      spinner.succeed(
        `Created ${validationRecords.length} DNS validation record(s)`
      );
    } catch (error) {
      spinner.fail("Failed to create DNS validation records");
      throw new Error(
        `DNS record creation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }\n\n` +
          "Please check:\n" +
          "  - You have route53:ChangeResourceRecordSets permission\n" +
          "  - The hosted zone ID is correct\n" +
          "  - DNS records are not conflicting with existing records"
      );
    }
  }

  /**
   * Create CNAME record pointing to CloudFront distribution
   */
  async createCloudfrontAlias(
    hostedZoneId: string,
    domain: string,
    cloudfrontDomain: string
  ): Promise<void> {
    const spinner = ora(`Creating DNS CNAME record for ${domain}...`).start();

    try {
      // Ensure domain ends with a dot for Route53
      const fqdn = domain.endsWith(".") ? domain : `${domain}.`;
      const cfDomain = cloudfrontDomain.endsWith(".")
        ? cloudfrontDomain
        : `${cloudfrontDomain}.`;

      await this.client.send(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: hostedZoneId,
          ChangeBatch: {
            Comment: `CloudFront alias for ${domain} created by scf-deploy`,
            Changes: [
              {
                Action: ChangeAction.UPSERT,
                ResourceRecordSet: {
                  Name: fqdn,
                  Type: RRType.CNAME,
                  TTL: 300,
                  ResourceRecords: [{ Value: cfDomain }],
                },
              },
            ],
          },
        })
      );

      spinner.succeed(`Created CNAME record: ${domain} → ${cloudfrontDomain}`);
    } catch (error) {
      spinner.fail("Failed to create CloudFront CNAME record");
      throw new Error(
        `CNAME record creation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Create multiple DNS records at once
   */
  async createRecords(
    hostedZoneId: string,
    records: DnsRecord[]
  ): Promise<void> {
    if (records.length === 0) {
      return;
    }

    const spinner = ora(`Creating ${records.length} DNS record(s)...`).start();

    try {
      const changes: Change[] = records.map((record) => ({
        Action: ChangeAction.UPSERT,
        ResourceRecordSet: {
          Name: record.name.endsWith(".") ? record.name : `${record.name}.`,
          Type: record.type as RRType,
          TTL: record.ttl || 300,
          ResourceRecords: [{ Value: record.value }],
        },
      }));

      await this.client.send(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: hostedZoneId,
          ChangeBatch: {
            Comment: "DNS records created by scf-deploy",
            Changes: changes,
          },
        })
      );

      spinner.succeed(`Created ${records.length} DNS record(s)`);
    } catch (error) {
      spinner.fail("Failed to create DNS records");
      throw new Error(
        `DNS record creation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Ensure that hosted zone exists and is accessible.
   * If not found, automatically creates a public hosted zone for the domain.
   * For subdomains, requires parent zone to exist (won't auto-create subdomain zones).
   */
  async validateHostedZone(
    domain: string,
    app?: string,
    environment?: string
  ): Promise<string> {
    let zone = await this.findHostedZone(domain);

    if (!zone) {
      // Check if this is a subdomain (more than 2 parts)
      const domainParts = domain.replace(/\.$/, "").split(".");
      const isSubdomain = domainParts.length > 2;

      if (isSubdomain) {
        const parentDomain = domainParts.slice(-2).join(".");
        throw new Error(
          `No hosted zone found for ${domain}\n\n` +
            `This appears to be a subdomain. Please ensure:\n` +
            `  - Parent domain (${parentDomain}) has a hosted zone in Route53\n` +
            `  - Or create the parent hosted zone first\n\n` +
            `Tip: Run 'scf deploy' with the parent domain (${parentDomain}) first,\n` +
            `     then deploy your subdomain.`
        );
      }

      console.log();
      console.log(
        chalk.yellow("⚠"),
        `Route53 hosted zone not found for ${chalk.bold(domain)}`
      );
      console.log(
        chalk.gray("   Creating public hosted zone automatically...")
      );
      console.log();

      zone = await this.createHostedZone(domain, app, environment);
    }

    if (!zone.Id) {
      throw new Error("Hosted zone found but ID is missing");
    }

    return zone.Id;
  }

  /**
   * Get hosted zone ID from zone object
   */
  extractHostedZoneId(hostedZoneId: string): string {
    // Route53 returns IDs like "/hostedzone/Z123456789ABC"
    // We need just "Z123456789ABC"
    return hostedZoneId.replace("/hostedzone/", "");
  }

  /**
   * Delete all records except NS and SOA from a hosted zone
   * This is required before deleting the hosted zone
   */
  private async deleteAllRecords(hostedZoneId: string): Promise<void> {
    const spinner = ora("Deleting DNS records...").start();

    try {
      const { ResourceRecordSets } = await this.client.send(
        new ListResourceRecordSetsCommand({
          HostedZoneId: hostedZoneId,
        })
      );

      if (!ResourceRecordSets || ResourceRecordSets.length === 0) {
        spinner.succeed("No records to delete");
        return;
      }

      // Filter out NS and SOA records (cannot be deleted)
      const recordsToDelete = ResourceRecordSets.filter(
        (record) => record.Type !== RRType.NS && record.Type !== RRType.SOA
      );

      if (recordsToDelete.length === 0) {
        spinner.succeed("No deletable records found");
        return;
      }

      // Delete records in batches
      const changes: Change[] = recordsToDelete.map((record) => ({
        Action: ChangeAction.DELETE,
        ResourceRecordSet: record,
      }));

      await this.client.send(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: hostedZoneId,
          ChangeBatch: {
            Comment: "Deleting all records before zone deletion",
            Changes: changes,
          },
        })
      );

      spinner.succeed(`Deleted ${recordsToDelete.length} DNS record(s)`);
    } catch (error) {
      spinner.fail("Failed to delete DNS records");
      throw new Error(
        `DNS record deletion failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Delete a hosted zone
   * Note: All records except NS and SOA must be deleted first
   */
  async deleteHostedZone(hostedZoneId: string): Promise<void> {
    const spinner = ora("Deleting Route53 hosted zone...").start();

    try {
      const id = this.extractHostedZoneId(hostedZoneId);

      // First, delete all non-NS/SOA records
      spinner.text = "Preparing hosted zone for deletion...";
      await this.deleteAllRecords(id);

      // Now delete the hosted zone
      spinner.text = "Deleting Route53 hosted zone...";
      await this.client.send(
        new DeleteHostedZoneCommand({
          Id: id,
        })
      );

      spinner.succeed("Route53 hosted zone deleted successfully");
    } catch (error) {
      spinner.fail("Failed to delete Route53 hosted zone");

      // Check for common errors
      if (error instanceof Error) {
        if (error.message.includes("not empty")) {
          throw new Error(
            "Hosted zone still has records that cannot be deleted.\n" +
              "Please manually remove all records except NS and SOA records, then retry."
          );
        }
      }

      throw new Error(
        `Route53 hosted zone deletion failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
