import * as fs from 'fs/promises';
import * as path from 'path';
import { TokenData } from '../../application/types/index';
import { logger } from '../logging/Logger';

/**
 * Token store interface
 */
export interface ITokenStore {
  save(data: TokenData): Promise<void>;
  load(): Promise<TokenData | null>;
  clear(): Promise<void>;
  isExpired(data: TokenData): boolean;
  getTimeUntilExpiry(data: TokenData): number;
}

/**
 * Refresh threshold in milliseconds (15 minutes before expiry)
 */
const REFRESH_THRESHOLD_MS = 15 * 60 * 1000;

/**
 * Default token file path
 */
const DEFAULT_TOKEN_FILE = '.tokens.json';

/**
 * File-based token store implementation
 */
export class TokenStore implements ITokenStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || path.resolve(process.cwd(), DEFAULT_TOKEN_FILE);
  }

  /**
   * Save token data to file
   */
  async save(data: TokenData): Promise<void> {
    try {
      const content = JSON.stringify(data, null, 2);
      await fs.writeFile(this.filePath, content, 'utf-8');
      logger.debug('Token saved successfully', { filePath: this.filePath });
    } catch (error) {
      logger.error('Failed to save token', error as Error);
      throw error;
    }
  }

  /**
   * Load token data from file
   */
  async load(): Promise<TokenData | null> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(content) as TokenData;
      logger.debug('Token loaded successfully', { filePath: this.filePath });
      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.debug('Token file not found', { filePath: this.filePath });
        return null;
      }
      logger.error('Failed to load token', error as Error);
      throw error;
    }
  }

  /**
   * Clear (delete) token file
   */
  async clear(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
      logger.debug('Token cleared successfully', { filePath: this.filePath });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.debug('Token file does not exist, nothing to clear');
        return;
      }
      logger.error('Failed to clear token', error as Error);
      throw error;
    }
  }

  /**
   * Check if token is expired or about to expire
   */
  isExpired(data: TokenData): boolean {
    const now = Date.now();
    const expiresAt = data.expiresAt;
    const timeUntilExpiry = expiresAt - now;

    return timeUntilExpiry <= REFRESH_THRESHOLD_MS;
  }

  /**
   * Get time until token expiry in milliseconds
   */
  getTimeUntilExpiry(data: TokenData): number {
    const now = Date.now();
    return Math.max(0, data.expiresAt - now);
  }
}

/**
 * Default token store instance
 */
export const tokenStore = new TokenStore();

export default tokenStore;
