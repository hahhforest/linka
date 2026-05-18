import { useConnectionStore, type DaemonConnectionStatus } from "../../store/connectionStore.js";

const statusLabel: Record<DaemonConnectionStatus, string> = {
  checking: "checking",
  online: "online",
  offline: "offline",
  error: "error",
};

const statusClassName: Record<DaemonConnectionStatus, string> = {
  checking: "bg-caution",
  online: "bg-linka",
  offline: "bg-caution",
  error: "bg-danger",
};

export const ConnectionBar = () => {
  const status = useConnectionStore((state) => state.status);
  const health = useConnectionStore((state) => state.health);
  const checkDaemonConnection = useConnectionStore((state) => state.checkDaemonConnection);

  return (
    <header className="flex min-h-[45px] flex-wrap items-center justify-between gap-2 border-b border-line bg-[#fffdf8]/95 px-4 py-2 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusClassName[status]}`} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">LinkA Daemon</p>
          <p className="truncate font-mono text-xs text-muted">
            GET /linka/health · {statusLabel[status]}
            {health?.version ? ` · ${health.version}` : ""}
          </p>
        </div>
      </div>
      <button
        className="rounded-md border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink hover:border-linka hover:text-linka disabled:cursor-wait disabled:opacity-60"
        disabled={status === "checking"}
        type="button"
        onClick={() => void checkDaemonConnection()}
      >
        刷新连接
      </button>
    </header>
  );
};
