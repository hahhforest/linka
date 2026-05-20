import { useConnectionStore, type DaemonConnectionStatus } from "../../store/connectionStore.js";
import { useRealtimeStore, type RealtimeConnectionStatus } from "../../store/realtimeStore.js";

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

const realtimeStatusLabel: Record<RealtimeConnectionStatus, string> = {
  idle: "sse idle",
  connecting: "sse connecting",
  open: "sse open",
  error: "sse error",
};

export const ConnectionBar = () => {
  const status = useConnectionStore((state) => state.status);
  const health = useConnectionStore((state) => state.health);
  const checkDaemonConnection = useConnectionStore((state) => state.checkDaemonConnection);
  const realtimeStatus = useRealtimeStore((state) => state.status);
  const realtimeLastCursor = useRealtimeStore((state) => state.lastCursor);

  return (
    <header className="grid min-h-[45px] grid-cols-1 items-center gap-3 border-b border-line bg-[#fffdf8]/95 px-4 py-2 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,520px)_auto]">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusClassName[status]}`} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">LinkA Daemon</p>
          <p className="truncate font-mono text-xs text-muted">
            GET /linka/health · {statusLabel[status]}
            {health?.version ? ` · ${health.version}` : ""} · {realtimeStatusLabel[realtimeStatus]}
            {realtimeLastCursor > 0 ? ` · cursor ${realtimeLastCursor}` : ""}
          </p>
        </div>
      </div>
      <div className="hidden min-w-0 items-center rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-muted lg:flex">
        <span className="font-mono text-xs">⌘K</span>
        <span className="ml-2 truncate">搜索 Room / Doc / 消息 / 成员...</span>
      </div>
      <div className="flex items-center justify-between gap-3 lg:justify-end">
        <button
          className="rounded-md border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink hover:border-linka hover:text-linka disabled:cursor-wait disabled:opacity-60"
          disabled={status === "checking"}
          type="button"
          onClick={() => void checkDaemonConnection()}
        >
          刷新连接
        </button>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2 py-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#d8ecf5] text-sm font-semibold text-signal">
            A
          </span>
          <span className="text-sm font-semibold">Alice</span>
        </div>
      </div>
    </header>
  );
};
