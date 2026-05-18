import { getDataDir, getProfile, resolvePort } from "@linka/config";

export const DAEMON_VERSION = "0.0.0";

export type ConfigEnv = Record<string, string | undefined>;

export interface GitInfo {
  branch?: string | null;
  worktreeRoot?: string | null;
}

export interface DaemonContainerOptions {
  env?: ConfigEnv;
  cwd?: string;
  git?: GitInfo | (() => GitInfo | null | undefined) | null;
  home?: string;
  profile?: string;
  version?: string;
  now?: () => Date;
}

export interface DaemonContainer {
  readonly profile: string;
  readonly port: number;
  readonly dataDir: string;
  readonly version: string;
  readonly startedAt: Date;
  readonly uptimeMs: () => number;
}

export function createDaemonContainer(options: DaemonContainerOptions = {}): DaemonContainer {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const profile = resolveContainerProfile(options);
  const port = resolvePort({ ...options, profile });
  const dataDir = getDataDir({ ...options, profile });

  return {
    profile,
    port,
    dataDir,
    version: options.version ?? DAEMON_VERSION,
    startedAt,
    uptimeMs: () => Math.max(0, now().getTime() - startedAt.getTime()),
  };
}

function resolveContainerProfile(options: DaemonContainerOptions): string {
  if (options.profile === undefined) {
    return getProfile(options);
  }

  return getProfile({ ...options, env: { ...options.env, LINKA_PROFILE: options.profile } });
}
