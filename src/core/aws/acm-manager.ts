/**
 * ACM (AWS Certificate Manager) Manager
 * Handles SSL/TLS certificate creation and validation for CloudFront
 */

import {
  ACMClient,
  RequestCertificateCommand,
  DescribeCertificateCommand,
  ListCertificatesCommand,
  DeleteCertificateCommand,
  type CertificateDetail,
  CertificateStatus,
} from '@aws-sdk/client-acm';
import type { AwsCredentialIdentityProvider } from '@aws-sdk/types';
import chalk from 'chalk';
import ora from 'ora';

/**
 * ACM certificate validation record
 */
export interface CertificateValidationRecord {
  name: string;
  type: string;
  value: string;
}

/**
 * ACM Manager options
 */
export interface ACMManagerOptions {
  credentials?: AwsCredentialIdentityProvider;
}

/**
 * ACM Manager for certificate operations
 * NOTE: Always uses us-east-1 region (CloudFront requirement)
 */
export class ACMManager {
  private client: ACMClient;

  constructor(options: ACMManagerOptions = {}) {
    // CloudFront requires certificates in us-east-1
    this.client = new ACMClient({
      region: 'us-east-1',
      credentials: options.credentials,
    });
  }

  /**
   * Find existing validated certificate for a domain
   */
  async findExistingCertificate(domain: string): Promise<string | null> {
    try {
      const { CertificateSummaryList } = await this.client.send(
        new ListCertificatesCommand({
          CertificateStatuses: [CertificateStatus.ISSUED],
        })
      );

      if (!CertificateSummaryList || CertificateSummaryList.length === 0) {
        return null;
      }

      // Find certificate that matches the domain
      for (const cert of CertificateSummaryList) {
        if (cert.DomainName === domain) {
          return cert.CertificateArn || null;
        }

        // Check if domain is in SubjectAlternativeNames
        const details = await this.client.send(
          new DescribeCertificateCommand({
            CertificateArn: cert.CertificateArn,
          })
        );

        const altNames = details.Certificate?.SubjectAlternativeNames || [];
        if (altNames.includes(domain)) {
          return cert.CertificateArn || null;
        }
      }

      return null;
    } catch (error) {
      console.warn(
        chalk.yellow(
          `Warning: Failed to check existing certificates: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      return null;
    }
  }

  /**
   * Request a new ACM certificate with DNS validation
   */
  async requestCertificate(
    domain: string,
    alternativeNames?: string[],
    app?: string,
    environment?: string
  ): Promise<string> {
    const spinner = ora('Requesting ACM certificate...').start();

    try {
      const subjectAlternativeNames = alternativeNames
        ? [domain, ...alternativeNames]
        : [domain];

      const tags = [
        { Key: 'scf:managed', Value: 'true' },
        { Key: 'scf:tool', Value: 'scf-deploy' },
        { Key: 'scf:domain', Value: domain },
        { Key: 'scf:auto-created', Value: 'true' },
      ];

      // Add app and environment tags if provided
      if (app) {
        tags.push({ Key: 'scf:app', Value: app });
      }
      if (environment) {
        tags.push({ Key: 'scf:environment', Value: environment });
      }

      const { CertificateArn } = await this.client.send(
        new RequestCertificateCommand({
          DomainName: domain,
          SubjectAlternativeNames: subjectAlternativeNames,
          ValidationMethod: 'DNS',
          Tags: tags,
        })
      );

      if (!CertificateArn) {
        throw new Error('Failed to request certificate: No ARN returned');
      }

      spinner.succeed('ACM certificate requested successfully');
      return CertificateArn;
    } catch (error) {
      spinner.fail('Failed to request ACM certificate');
      throw new Error(
        `ACM certificate request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get DNS validation records for certificate
   */
  async getCertificateValidationRecords(
    certificateArn: string
  ): Promise<CertificateValidationRecord[]> {
    try {
      const { Certificate } = await this.client.send(
        new DescribeCertificateCommand({
          CertificateArn: certificateArn,
        })
      );

      if (!Certificate?.DomainValidationOptions) {
        throw new Error('No domain validation options found');
      }

      const records: CertificateValidationRecord[] = [];

      for (const option of Certificate.DomainValidationOptions) {
        const resourceRecord = option.ResourceRecord;
        if (resourceRecord?.Name && resourceRecord?.Type && resourceRecord?.Value) {
          records.push({
            name: resourceRecord.Name,
            type: resourceRecord.Type,
            value: resourceRecord.Value,
          });
        }
      }

      if (records.length === 0) {
        throw new Error('No DNS validation records available yet');
      }

      return records;
    } catch (error) {
      throw new Error(
        `Failed to get validation records: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Wait for certificate validation to complete
   * Polls certificate status until it's validated or timeout
   */
  async waitForCertificateValidation(
    certificateArn: string,
    timeoutMinutes: number = 30
  ): Promise<void> {
    const spinner = ora({
      text: 'Waiting for certificate validation...',
      spinner: 'dots',
    }).start();

    const startTime = Date.now();
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const pollInterval = 30 * 1000; // Poll every 30 seconds

    let attempts = 0;

    while (true) {
      const elapsed = Date.now() - startTime;

      if (elapsed > timeoutMs) {
        spinner.fail('Certificate validation timeout');
        throw new Error(
          `Certificate validation timed out after ${timeoutMinutes} minutes.\n` +
            'Please check:\n' +
            '  - DNS validation records are created correctly\n' +
            '  - DNS propagation is complete\n' +
            '  - You have necessary permissions\n\n' +
            'You can retry the deployment after DNS records are propagated.'
        );
      }

      try {
        const { Certificate } = await this.client.send(
          new DescribeCertificateCommand({
            CertificateArn: certificateArn,
          })
        );

        const status = Certificate?.Status;

        if (status === CertificateStatus.ISSUED) {
          spinner.succeed('Certificate validated successfully!');
          return;
        }

        if (status === CertificateStatus.FAILED || status === CertificateStatus.REVOKED) {
          spinner.fail(`Certificate validation failed: ${status}`);
          throw new Error(
            `Certificate validation failed with status: ${status}\n` +
              `Failure reason: ${Certificate?.FailureReason || 'Unknown'}`
          );
        }

        // Update spinner with progress
        attempts++;
        const minutesElapsed = Math.floor(elapsed / 60000);
        spinner.text = `Waiting for certificate validation... (${minutesElapsed}m elapsed, attempt ${attempts})`;

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error) {
        if (error instanceof Error && error.message.includes('validation failed')) {
          throw error;
        }

        // Other errors - retry
        spinner.text = `Retrying certificate status check... (${attempts})`;
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }
  }

  /**
   * Get certificate details
   */
  async getCertificateDetails(certificateArn: string): Promise<CertificateDetail> {
    const { Certificate } = await this.client.send(
      new DescribeCertificateCommand({
        CertificateArn: certificateArn,
      })
    );

    if (!Certificate) {
      throw new Error('Certificate not found');
    }

    return Certificate;
  }

  /**
   * Check if certificate is valid and issued
   */
  async isCertificateValid(certificateArn: string): Promise<boolean> {
    try {
      const certificate = await this.getCertificateDetails(certificateArn);
      return certificate.Status === CertificateStatus.ISSUED;
    } catch {
      return false;
    }
  }

  /**
   * Delete ACM certificate
   * Note: Certificate must not be in use by any AWS resources (e.g., CloudFront)
   */
  async deleteCertificate(certificateArn: string): Promise<void> {
    const spinner = ora('Deleting ACM certificate...').start();

    try {
      await this.client.send(
        new DeleteCertificateCommand({
          CertificateArn: certificateArn,
        })
      );

      spinner.succeed('ACM certificate deleted successfully');
    } catch (error) {
      spinner.fail('Failed to delete ACM certificate');

      // Check if it's in-use error
      if (error instanceof Error && error.message.includes('in use')) {
        throw new Error(
          'Certificate is currently in use by CloudFront or other AWS resources.\n' +
          'Please delete the CloudFront distribution first, then retry.'
        );
      }

      throw new Error(
        `ACM certificate deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
