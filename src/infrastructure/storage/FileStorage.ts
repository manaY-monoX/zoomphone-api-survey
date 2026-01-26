import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../../config/index';
import { logger } from '../logging/Logger';

/**
 * File storage interface
 */
export interface IFileStorage {
  save(fileName: string, data: Buffer): Promise<string>;
  exists(fileName: string): Promise<boolean>;
  getPath(fileName: string): string;
  ensureDirectory(): Promise<void>;
}

/**
 * File-based storage implementation for recordings
 */
export class FileStorage implements IFileStorage {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), config.storage.recordingsOutputDir);
  }

  /**
   * Ensure the storage directory exists
   */
  async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      logger.debug('Storage directory ensured', { directory: this.baseDir });
    } catch (error) {
      logger.error('Failed to create storage directory', error as Error);
      throw error;
    }
  }

  /**
   * Get the full path for a file
   */
  getPath(fileName: string): string {
    return path.join(this.baseDir, fileName);
  }

  /**
   * Check if a file exists
   */
  async exists(fileName: string): Promise<boolean> {
    try {
      const filePath = this.getPath(fileName);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a unique file name if file already exists
   */
  private async getUniqueFileName(fileName: string): Promise<string> {
    if (!(await this.exists(fileName))) {
      return fileName;
    }

    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    const timestamp = Date.now();

    return `${baseName}_${timestamp}${ext}`;
  }

  /**
   * Save data to a file
   */
  async save(fileName: string, data: Buffer): Promise<string> {
    try {
      await this.ensureDirectory();

      const uniqueFileName = await this.getUniqueFileName(fileName);
      const filePath = this.getPath(uniqueFileName);

      await fs.writeFile(filePath, data);

      logger.info('File saved successfully', {
        fileName: uniqueFileName,
        filePath,
        size: data.length,
      });

      return filePath;
    } catch (error) {
      logger.error('Failed to save file', error as Error, { fileName });
      throw error;
    }
  }
}

/**
 * Default file storage instance
 */
export const fileStorage = new FileStorage();

export default fileStorage;
