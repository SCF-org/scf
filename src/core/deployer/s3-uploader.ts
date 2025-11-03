/**
 * S3 file uploader
 */

import { S3Client, PutObjectCommand, type PutObjectCommandInput } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream, readFileSync } from 'node:fs';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import pLimit from 'p-limit';
import type { FileInfo, UploadResult, UploadOptions } from '../../types/deployer.js';

const gzipAsync = promisify(gzip);

/**
 * Gzip file content
 */
async function gzipFile(filePath: string): Promise<Buffer> {
  const content = readFileSync(filePath);
  return gzipAsync(content);
}

/**
 * Upload a single file to S3
 */
export async function uploadFile(
  client: S3Client,
  bucketName: string,
  file: FileInfo,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const { gzip: enableGzip = true, dryRun = false } = options;

  const startTime = Date.now();

  try {
    // Dry run mode
    if (dryRun) {
      return {
        file,
        success: true,
        status: 'uploaded',
        duration: Date.now() - startTime,
      };
    }

    // Prepare upload parameters
    const params: PutObjectCommandInput = {
      Bucket: bucketName,
      Key: file.key,
      ContentType: file.contentType,
    };

    // Handle gzip compression
    if (enableGzip && file.shouldGzip) {
      const compressed = await gzipFile(file.absolutePath);
      params.Body = compressed;
      params.ContentEncoding = 'gzip';
    } else {
      params.Body = createReadStream(file.absolutePath);
    }

    // Use multipart upload for files larger than 5MB
    if (file.size > 5 * 1024 * 1024) {
      const upload = new Upload({
        client,
        params,
      });

      await upload.done();
    } else {
      // Use PutObject for smaller files
      const command = new PutObjectCommand(params);
      await client.send(command);
    }

    return {
      file,
      success: true,
      status: 'uploaded',
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      file,
      success: false,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Upload multiple files in parallel
 */
export async function uploadFiles(
  client: S3Client,
  bucketName: string,
  files: FileInfo[],
  options: UploadOptions = {},
  onProgress?: (completed: number, total: number, current: FileInfo) => void
): Promise<UploadResult[]> {
  const { concurrency = 10 } = options;

  const limit = pLimit(concurrency);
  const results: UploadResult[] = [];
  let completed = 0;

  const uploadPromises = files.map((file) =>
    limit(async () => {
      const result = await uploadFile(client, bucketName, file, options);
      results.push(result);
      completed++;

      if (onProgress) {
        onProgress(completed, files.length, file);
      }

      return result;
    })
  );

  await Promise.all(uploadPromises);

  return results;
}

/**
 * Calculate total size of files
 */
export function calculateTotalSize(files: FileInfo[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
