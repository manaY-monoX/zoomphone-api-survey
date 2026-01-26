import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  zoom: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    apiBaseUrl: string;
  };
  webhook: {
    port: number;
    secretToken: string;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
  storage: {
    recordingsOutputDir: string;
  };
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

function getEnvVarAsNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
}

export const config: Config = {
  zoom: {
    clientId: getEnvVar('ZOOM_CLIENT_ID', ''),
    clientSecret: getEnvVar('ZOOM_CLIENT_SECRET', ''),
    redirectUri: getEnvVar('ZOOM_REDIRECT_URI', 'http://localhost:3000/oauth/callback'),
    apiBaseUrl: getEnvVar('ZOOM_API_BASE_URL', 'https://api.zoom.us/v2'),
  },
  webhook: {
    port: getEnvVarAsNumber('WEBHOOK_PORT', 3001),
    secretToken: getEnvVar('ZOOM_WEBHOOK_SECRET_TOKEN', ''),
  },
  logging: {
    level: (getEnvVar('LOG_LEVEL', 'info') as Config['logging']['level']),
  },
  storage: {
    recordingsOutputDir: getEnvVar('RECORDINGS_OUTPUT_DIR', './recordings'),
  },
};

export default config;
