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
  online: "bg-success",
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
    <header className="grid min-h-[46px] grid-cols-1 items-center gap-3 border-b border-line bg-panel/88 px-3 py-2 backdrop-blur md:grid-cols-[minmax(190px,1fr)_minmax(260px,520px)_auto] md:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-linka/35 bg-[#f0ecff] text-sm font-semibold text-linka shadow-sketch">
          ✧
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-5">LinkA Daemon</p>
          <p className="truncate font-mono text-[11px] text-muted">
            /linka/health · {statusLabel[status]}
            {health?.version ? ` · ${health.version}` : ""} · {realtimeStatusLabel[realtimeStatus]}
            {realtimeLastCursor > 0 ? ` · cursor ${realtimeLastCursor}` : ""}
          </p>
        </div>
      </div>

      <div className="hidden min-w-0 items-center rounded-md border border-line bg-[#fbf7ed] px-3 py-1.5 text-sm text-muted shadow-insetline md:flex">
        <span className="font-mono text-[11px] text-linka">⌘K</span>
        <span className="ml-2 truncate">搜索 Room / Doc / 消息 / 成员...</span>
      </div>

      <div className="flex items-center justify-between gap-2 md:justify-end">
        <button
          className="rounded-md border border-line bg-[#fbf7ed] px-3 py-1.5 text-xs font-semibold text-ink hover:border-linka hover:text-linka disabled:cursor-wait disabled:opacity-60"
          disabled={status === "checking"}
          type="button"
          onClick={() => void checkDaemonConnection()}
        >
          刷新
        </button>
        <span className={`h-2.5 w-2.5 rounded-full ${statusClassName[status]}`} />
        <div className="flex items-center gap-2 rounded-md border border-line bg-panel px-2 py-1 shadow-sketch">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f4d9ca] text-sm font-semibold text-danger">
            A
          </span>
          <span className="text-sm font-semibold">Alice</span>
        </div>
      </div>
    </header>
  );
};
