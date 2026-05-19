import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface OpenCodeCommandRunnerResult {
  readonly stdout: string;
  readonly stderr?: string;
}

export type OpenCodeCommandRunner = (
  command: string,
  args: readonly string[],
) => Promise<OpenCodeCommandRunnerResult>;

export interface ProbeOpenCodeCommandOptions {
  readonly command?: string;
  readonly runner?: OpenCodeCommandRunner;
}

export type OpenCodeCommandProbeResult =
  | {
      readonly available: true;
      readonly command: string;
      readonly version: string;
    }
  | {
      readonly available: false;
      readonly command: string;
      readonly errorMessage: string;
    };

const execFileAsync = promisify(execFile);

const defaultOpenCodeCommandRunner: OpenCodeCommandRunner = async (command, args) => {
  const { stdout, stderr } = await execFileAsync(command, [...args], { encoding: "utf8" });

  return { stdout, stderr };
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return String(error);
};

export const probeOpenCodeCommand = async (
  options: ProbeOpenCodeCommandOptions = {},
): Promise<OpenCodeCommandProbeResult> => {
  const command = options.command ?? "opencode";
  const runner = options.runner ?? defaultOpenCodeCommandRunner;

  try {
    const { stdout } = await runner(command, ["--version"]);
    const version = stdout.split(/\r?\n/, 1)[0]?.trim() ?? "";

    if (version.length === 0) {
      return {
        available: false,
        command,
        errorMessage: "OpenCode command returned empty stdout.",
      };
    }

    return { available: true, command, version };
  } catch (error) {
    return {
      available: false,
      command,
      errorMessage: getErrorMessage(error),
    };
  }
};
