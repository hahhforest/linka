import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export const DEFAULT_PORT = 4510;

const MAIN_PROFILES = new Set(["main", "master", "trunk"]);
const MAX_PORT = 65535;
const PROFILE_FALLBACK = "default";
const PID_FILE_NAME = "daemon.pid.json";
const PID_FILE_VERSION = 1;
const PROFILE_HASH_LENGTH = 8;

export type ConfigEnv = Record<string, string | undefined>;

export interface GitInfo {
  branch?: string | null;
  worktreeRoot?: string | null;
}

export interface ProfileOptions {
  env?: ConfigEnv;
  cwd?: string;
  git?: GitInfo | (() => GitInfo | null | undefined) | null;
}

export interface DataDirOptions extends ProfileOptions {
  home?: string;
  profile?: string;
}

export interface PortOptions extends ProfileOptions {
  profile?: string;
}

export interface PidFileOptions extends DataDirOptions {
  pidFilePath?: string;
}

export interface PidFileRecord {
  version: 1;
  profile: string;
  pid: number;
  port: number;
  dataDir: string;
  cwd: string;
  startedAt: string;
}

export interface PidFileInput {
  profile?: string;
  pid?: number;
  port: number;
  startedAt?: string | Date;
}

export type ConfigErrorCode =
  | "INVALID_PROFILE"
  | "INVALID_PORT"
  | "INVALID_PID_FILE"
  | "PROFILE_MISMATCH"
  | "IO_ERROR";

export class ConfigError extends Error {
  readonly code: ConfigErrorCode;

  constructor(code: ConfigErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ConfigError";
    this.code = code;
  }
}

export function getProfile(options: ProfileOptions = {}): string {
  const env = options.env ?? process.env;
  const envProfile = env.LINKA_PROFILE?.trim();

  if (envProfile) {
    return sanitizeProfileOrThrow(envProfile, "LINKA_PROFILE");
  }

  const git = resolveGitInfo(options);
  const branch = git.branch?.trim();
  const normalizedBranch = branch ? sanitizeProfileOrThrow(branch, "git branch") : undefined;

  if (normalizedBranch && MAIN_PROFILES.has(normalizedBranch)) {
    return "main";
  }

  const root = resolve(git.worktreeRoot?.trim() || options.cwd || process.cwd());
  const profileBase = normalizedBranch || sanitizeProfile(basename(root)) || PROFILE_FALLBACK;
  const hashInput = `${profileBase}:${root}`;

  return withProfileHash(profileBase, hashInput);
}

export function getDataDir(options: DataDirOptions = {}): string {
  const env = options.env ?? process.env;
  const profile = resolveProfileOption(options);
  const linkaHome = env.LINKA_HOME?.trim();
  const root = linkaHome ? expandHome(linkaHome, options.home) : join(options.home ?? homedir(), ".linka");

  return resolve(root, "profiles", profile);
}

export function resolvePort(options: PortOptions = {}): number {
  const env = options.env ?? process.env;
  const envPort = env.LINKA_PORT?.trim();

  if (envPort) {
    return parsePort(envPort, "LINKA_PORT");
  }

  const profile = resolveProfileOption(options);

  if (profile === "main") {
    return DEFAULT_PORT;
  }

  return DEFAULT_PORT + 1 + (stableHash(profile) % 20_000);
}

export function getPidFilePath(options: PidFileOptions = {}): string {
  if (options.pidFilePath) {
    return resolve(options.pidFilePath);
  }

  return join(getDataDir(options), PID_FILE_NAME);
}

export function parsePidFile(content: string): PidFileRecord {
  let value: unknown;

  try {
    value = JSON.parse(content);
  } catch (cause) {
    throw new ConfigError("INVALID_PID_FILE", "PID file is not valid JSON.", { cause });
  }

  if (!isPlainObject(value)) {
    throw new ConfigError("INVALID_PID_FILE", "PID file must contain a JSON object.");
  }

  const version = validatePidFileVersion(value.version);
  const profile = validateProfileField(value.profile, "PID file profile");
  const pid = validatePositiveInteger(value.pid, "PID file pid");
  const port = validatePortValue(value.port, "PID file port");
  const dataDir = validateAbsolutePath(value.dataDir, "PID file dataDir");
  const cwd = validateAbsolutePath(value.cwd, "PID file cwd");
  const startedAt = validateStartedAt(value.startedAt);

  return { version, profile, pid, port, dataDir, cwd, startedAt };
}

export function formatPidFile(input: PidFileRecord): string {
  const record: PidFileRecord = {
    version: validatePidFileVersion(input.version),
    profile: validateProfileField(input.profile, "PID file profile"),
    pid: validatePositiveInteger(input.pid, "PID file pid"),
    port: validatePortValue(input.port, "PID file port"),
    dataDir: validateAbsolutePath(input.dataDir, "PID file dataDir"),
    cwd: validateAbsolutePath(input.cwd, "PID file cwd"),
    startedAt: normalizeStartedAt(input.startedAt)
  };

  return `${JSON.stringify(record, null, 2)}\n`;
}

export function readPidFile(options: PidFileOptions = {}): PidFileRecord | null {
  const path = getPidFilePath(options);

  if (!existsSync(path)) {
    return null;
  }

  try {
    const record = parsePidFile(readFileSync(path, "utf8"));
    const expectedProfile = resolveProfileOption(options);
    return record.profile === expectedProfile ? record : null;
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }

    throw new ConfigError("IO_ERROR", `Failed to read PID file at ${path}.`, { cause: error });
  }
}

export function writePidFile(input: PidFileInput, options: PidFileOptions = {}): PidFileRecord {
  const profile = resolveProfileOption(options);

  if (input.profile !== undefined && sanitizeProfileOrThrow(input.profile, "PID file profile") !== profile) {
    throw new ConfigError(
      "PROFILE_MISMATCH",
      `Refusing to write PID file for profile '${input.profile}' while current profile is '${profile}'.`
    );
  }

  const record: PidFileRecord = {
    version: PID_FILE_VERSION,
    profile,
    pid: validatePositiveInteger(input.pid ?? process.pid, "PID file pid"),
    port: validatePortValue(input.port, "PID file port"),
    dataDir: getDataDir({ ...options, profile }),
    cwd: resolve(options.cwd ?? process.cwd()),
    startedAt: normalizeStartedAt(input.startedAt)
  };

  const path = getPidFilePath({ ...options, profile });

  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, formatPidFile(record), "utf8");
  } catch (error) {
    throw new ConfigError("IO_ERROR", `Failed to write PID file at ${path}.`, { cause: error });
  }

  return record;
}

export function removePidFile(options: PidFileOptions = {}): void {
  const path = getPidFilePath(options);

  try {
    rmSync(path, { force: true });
  } catch (error) {
    throw new ConfigError("IO_ERROR", `Failed to remove PID file at ${path}.`, { cause: error });
  }
}

export function getRunningDaemonPort(options: PidFileOptions = {}): number | null {
  const record = readPidFile(options);
  return record?.port ?? null;
}

function resolveProfileOption(options: DataDirOptions | PortOptions | PidFileOptions): string {
  return options.profile === undefined ? getProfile(options) : sanitizeProfileOrThrow(options.profile, "profile");
}

function resolveGitInfo(options: ProfileOptions): Required<GitInfo> {
  const injected = typeof options.git === "function" ? options.git() : options.git;

  if (injected) {
    return {
      branch: injected.branch ?? null,
      worktreeRoot: injected.worktreeRoot ?? null
    };
  }

  if (options.git === null) {
    return { branch: null, worktreeRoot: null };
  }

  const cwd = options.cwd ?? process.cwd();

  return {
    branch: runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd),
    worktreeRoot: runGit(["rev-parse", "--show-toplevel"], cwd)
  };
}

function runGit(args: string[], cwd: string): string | null {
  try {
    const output = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();

    return output && output !== "HEAD" ? output : null;
  } catch {
    return null;
  }
}

function sanitizeProfileOrThrow(value: string, source: string): string {
  const profile = sanitizeProfile(value);

  if (!profile) {
    throw new ConfigError("INVALID_PROFILE", `${source} does not produce a valid LinkA profile.`);
  }

  return MAIN_PROFILES.has(profile) ? "main" : profile;
}

function sanitizeProfile(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/[._-]{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
}

function withProfileHash(profileBase: string, hashInput: string): string {
  if (MAIN_PROFILES.has(profileBase)) {
    return "main";
  }

  return `${profileBase}-${shortHash(hashInput)}`;
}

function expandHome(value: string, home?: string): string {
  if (value === "~") {
    return home ?? homedir();
  }

  if (value.startsWith("~/")) {
    return join(home ?? homedir(), value.slice(2));
  }

  return value;
}

function stableHash(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function shortHash(value: string): string {
  return stableHash(value).toString(16).padStart(PROFILE_HASH_LENGTH, "0").slice(0, PROFILE_HASH_LENGTH);
}

function parsePort(value: string, source: string): number {
  if (!/^\d+$/.test(value)) {
    throw new ConfigError("INVALID_PORT", `${source} must be an integer between 1 and ${MAX_PORT}.`);
  }

  return validatePortValue(Number(value), source);
}

function validatePortValue(value: unknown, source: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_PORT) {
    throw new ConfigError("INVALID_PORT", `${source} must be an integer between 1 and ${MAX_PORT}.`);
  }

  return value;
}

function validatePositiveInteger(value: unknown, source: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ConfigError("INVALID_PID_FILE", `${source} must be a positive integer.`);
  }

  return value;
}

function validatePidFileVersion(value: unknown): 1 {
  if (value !== PID_FILE_VERSION) {
    throw new ConfigError("INVALID_PID_FILE", `PID file version must be ${PID_FILE_VERSION}.`);
  }

  return PID_FILE_VERSION;
}

function validateProfileField(value: unknown, source: string): string {
  if (typeof value !== "string") {
    throw new ConfigError("INVALID_PROFILE", `${source} must be a string.`);
  }

  return sanitizeProfileOrThrow(value, source);
}

function validateAbsolutePath(value: unknown, source: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ConfigError("INVALID_PID_FILE", `${source} must be a non-empty absolute path.`);
  }

  const path = resolve(value);

  if (path !== value) {
    throw new ConfigError("INVALID_PID_FILE", `${source} must be an absolute normalized path.`);
  }

  return path;
}

function validateStartedAt(value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new ConfigError("INVALID_PID_FILE", "PID file startedAt must be a valid ISO date string.");
  }

  return value;
}

function normalizeStartedAt(value: string | Date | undefined): string {
  if (value === undefined) {
    return new Date().toISOString();
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new ConfigError("INVALID_PID_FILE", "PID file startedAt must be a valid date.");
    }

    return value.toISOString();
  }

  return validateStartedAt(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
