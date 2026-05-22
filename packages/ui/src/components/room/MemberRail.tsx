import { useEffect, useMemo, useState } from "react";

import type {
  Announcement,
  DocStatus,
  PendingInteraction,
  RoomMember,
  RuntimeEvent,
} from "@linka/shared";

import {
  exportHarnessRunTrajectory,
  type HarnessRunTrajectoryExport,
} from "../../services/harnessRunsService.js";
import { buildAgentActivityItems, type AgentActivityItem } from "../../store/agentActivity.js";
import { useRoomStore } from "../../store/roomStore.js";

const emptyMembers = [] as const;
const emptyAnnouncements = [] as const;
const emptyDocs = [] as const;
const emptyFiles = [] as const;
const emptyPins = [] as const;
const emptyRuns = [] as const;
const emptySessions = [] as const;
const emptyPendingInteractions = [] as const;
const emptyRuntimeEventsByRunId = {} as const;

type RailTab = "info" | "members" | "announcements" | "docs" | "activity" | "files";
type TrajectoryExportStatus = "idle" | "loading" | "success" | "error";
type TrajectoryCopyStatus = "idle" | "copied" | "error";

const tabs: readonly { readonly id: RailTab; readonly label: string }[] = [
  { id: "info", label: "信息" },
  { id: "members", label: "成员" },
  { id: "announcements", label: "公告" },
  { id: "docs", label: "Docs" },
  { id: "activity", label: "活动" },
  { id: "files", label: "文件" },
];

const memberAccent = (kind: string): string =>
  kind === "agent"
    ? "border-linka/35 bg-[#f0ecff] text-linka"
    : "border-danger/25 bg-[#f9dfd2] text-danger";

const formatShortTime = (timestamp: number): string =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));

const getBodyFirstLine = (body: string): string | undefined =>
  body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

const formatActivityLabel = (value: string): string => value.replace(/_/gu, " ");

const truncateInline = (text: string, maxLength = 140): string => {
  const normalized = text.trim().replace(/\s+/gu, " ");

  if (normalized.length <= maxLength) return normalized;

  return `${normalized.slice(0, maxLength - 1)}...`;
};

const truncatePreview = (text: string, maxLength = 2400): string => {
  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength)}\n... truncated ${text.length - maxLength} chars`;
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "导出 trajectory 失败";

const statusClass = (status: string): string => {
  if (status === "running" || status === "queued" || status === "output") {
    return "border-signal/30 bg-[#edf7f9] text-signal";
  }

  if (
    status === "succeeded" ||
    status === "completed" ||
    status === "idle" ||
    status === "created" ||
    status === "ready"
  ) {
    return "border-success/30 bg-[#edf7f1] text-success";
  }

  if (status === "failed" || status === "cancelled" || status === "error") {
    return "border-danger/30 bg-[#fae8e2] text-danger";
  }

  if (status === "waiting_user" || status === "paused" || status === "terminated") {
    return "border-caution/30 bg-[#fff3d8] text-caution";
  }

  return "border-line bg-[#fbf7ed] text-muted";
};

const severityClass = (severity: AgentActivityItem["severity"]): string => {
  if (severity === "success") return "border-success/30 bg-[#edf7f1] text-success";
  if (severity === "warning") return "border-caution/30 bg-[#fff3d8] text-caution";
  if (severity === "error") return "border-danger/30 bg-[#fae8e2] text-danger";

  return "border-line bg-[#fbf7ed] text-muted";
};

const runtimeEventSummary = (event: RuntimeEvent): string => {
  switch (event.payload.kind) {
    case "adapter_output":
      return event.payload.text
        ? truncateInline(event.payload.text)
        : `${event.payload.stream} output received`;
    case "adapter_error":
      return event.payload.code
        ? `${event.payload.code}: ${truncateInline(event.payload.message)}`
        : truncateInline(event.payload.message);
    case "adapter_metadata": {
      const keys = Object.keys(event.payload.data);
      return keys.length > 0 ? `metadata: ${keys.slice(0, 4).join(", ")}` : "metadata received";
    }
    case "run_status":
      return event.payload.message
        ? truncateInline(event.payload.message)
        : `status: ${event.payload.status}`;
    case "session_ref":
      return `session: ${event.payload.session.label ?? event.payload.session.adapterSessionId ?? event.payload.session.kind}`;
  }
};

const permissionSummary = (member: RoomMember): string => {
  const permissions = member.permissions;
  const enabled = [
    permissions.canPostMessage ? "发言" : undefined,
    permissions.canMentionMembers ? "提及" : undefined,
    permissions.canUploadFiles ? "上传" : undefined,
    permissions.canManageMembers ? "管理" : undefined,
  ].filter((value): value is string => value !== undefined);

  return enabled.length > 0 ? enabled.join(" / ") : "只读";
};

export const MemberRail = () => {
  const [activeTab, setActiveTab] = useState<RailTab>("info");
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>();
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>();
  const [docTitle, setDocTitle] = useState("");
  const [docBody, setDocBody] = useState("");
  const [docEditTitle, setDocEditTitle] = useState("");
  const [docEditBody, setDocEditBody] = useState("");
  const [docEditStatus, setDocEditStatus] = useState<DocStatus>("active");
  const [docCommentBody, setDocCommentBody] = useState("");
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  const [isCommentingDoc, setIsCommentingDoc] = useState(false);
  const [handoffToLinkA, setHandoffToLinkA] = useState(true);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | undefined>();
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);
  const [deletingAnnouncementId, setDeletingAnnouncementId] = useState<string | undefined>();
  const [selectedActivityId, setSelectedActivityId] = useState<string | undefined>();
  const [pendingResponseDrafts, setPendingResponseDrafts] = useState<Record<string, string>>({});
  const [respondingInteractionId, setRespondingInteractionId] = useState<string | undefined>();
  const [trajectoryExportStatus, setTrajectoryExportStatus] =
    useState<TrajectoryExportStatus>("idle");
  const [trajectoryExport, setTrajectoryExport] = useState<
    HarnessRunTrajectoryExport | undefined
  >();
  const [trajectoryExportError, setTrajectoryExportError] = useState<string | undefined>();
  const [trajectoryCopyStatus, setTrajectoryCopyStatus] = useState<TrajectoryCopyStatus>("idle");
  const activeRoomId = useRoomStore((state) => state.activeRoomId);
  const source = useRoomStore((state) => state.source);
  const room = useRoomStore((state) =>
    state.rooms.find((candidate) => candidate.id === activeRoomId),
  );
  const members = useRoomStore((state) =>
    activeRoomId ? (state.membersByRoomId[activeRoomId] ?? emptyMembers) : emptyMembers,
  );
  const docs = useRoomStore((state) =>
    activeRoomId ? (state.docsByRoomId[activeRoomId] ?? emptyDocs) : emptyDocs,
  );
  const files = useRoomStore((state) =>
    activeRoomId ? (state.filesByRoomId[activeRoomId] ?? emptyFiles) : emptyFiles,
  );
  const pins = useRoomStore((state) =>
    activeRoomId ? (state.pinnedItemsByRoomId[activeRoomId] ?? emptyPins) : emptyPins,
  );
  const runs = useRoomStore((state) =>
    activeRoomId ? (state.harnessRunsByRoomId[activeRoomId] ?? emptyRuns) : emptyRuns,
  );
  const sessions = useRoomStore((state) =>
    activeRoomId ? (state.harnessSessionsByRoomId[activeRoomId] ?? emptySessions) : emptySessions,
  );
  const pendingInteractions = useRoomStore((state) =>
    activeRoomId
      ? (state.pendingInteractionsByRoomId[activeRoomId] ?? emptyPendingInteractions)
      : emptyPendingInteractions,
  );
  const runtimeEventsByRunId = useRoomStore(
    (state) => state.runtimeEventsByRunId ?? emptyRuntimeEventsByRunId,
  );
  const announcements = useRoomStore((state) =>
    activeRoomId
      ? (state.announcementsByRoomId[activeRoomId] ?? emptyAnnouncements)
      : emptyAnnouncements,
  );
  const docDetailsByDocId = useRoomStore((state) => state.docDetailsByDocId);
  const isCreatingDoc = useRoomStore((state) => state.isCreatingDoc);
  const createActiveRoomDoc = useRoomStore((state) => state.createActiveRoomDoc);
  const loadActiveRoomDocDetail = useRoomStore((state) => state.loadActiveRoomDocDetail);
  const updateActiveRoomDoc = useRoomStore((state) => state.updateActiveRoomDoc);
  const createActiveDocComment = useRoomStore((state) => state.createActiveDocComment);
  const createActiveRoomAnnouncement = useRoomStore((state) => state.createActiveRoomAnnouncement);
  const updateActiveRoomAnnouncement = useRoomStore((state) => state.updateActiveRoomAnnouncement);
  const deleteActiveRoomAnnouncement = useRoomStore((state) => state.deleteActiveRoomAnnouncement);
  const respondToPendingInteraction = useRoomStore((state) => state.respondToPendingInteraction);
  const trimmedDocTitle = docTitle.trim();
  const trimmedDocEditTitle = docEditTitle.trim();
  const trimmedDocCommentBody = docCommentBody.trim();
  const trimmedAnnouncementBody = announcementBody.trim();
  const selectedMember = members.find((member) => member.id === selectedMemberId);
  const selectedDoc = docs.find((doc) => doc.id === selectedDocId) ?? docs[0];
  const selectedDocDetail = selectedDoc ? docDetailsByDocId[selectedDoc.id] : undefined;
  const editingAnnouncement = announcements.find(
    (announcement) => announcement.id === editingAnnouncementId,
  );
  const isApiBacked = source === "api";
  const roomRuntimeEventsByRunId = useMemo(
    () =>
      Object.fromEntries(runs.map((run) => [run.id, runtimeEventsByRunId[run.id] ?? []] as const)),
    [runs, runtimeEventsByRunId],
  );
  const activityItems = useMemo(
    () =>
      buildAgentActivityItems({
        members,
        sessions,
        runs,
        runtimeEventsByRunId: roomRuntimeEventsByRunId,
      }),
    [members, sessions, runs, roomRuntimeEventsByRunId],
  );
  const selectedActivity = activityItems.find((item) => item.id === selectedActivityId);
  const selectedActivityRunId = selectedActivity?.runId;
  const selectedActivityRawEvents = selectedActivity?.runId
    ? (roomRuntimeEventsByRunId[selectedActivity.runId] ?? selectedActivity.rawEvents)
    : (selectedActivity?.rawEvents ?? []);
  const trajectoryExportPreview = trajectoryExport ? truncatePreview(trajectoryExport.text) : "";
  const hasActiveRoom = activeRoomId !== undefined;
  const canWriteRoomContext = isApiBacked && hasActiveRoom;
  const requestedInteractions = pendingInteractions.filter(
    (interaction) => interaction.status === "requested",
  );

  const pendingSummary = (interaction: PendingInteraction): string => {
    const prompt = interaction.payload?.prompt;
    const reason = interaction.payload?.reason;
    if (typeof prompt === "string" && prompt.trim().length > 0) return prompt;
    if (typeof reason === "string" && reason.trim().length > 0) return reason;
    return `${interaction.kind} requested by ${interaction.agentMemberId}`;
  };

  const handlePendingResponse = (interaction: PendingInteraction) => {
    if (!canWriteRoomContext || respondingInteractionId) return;
    const draft = pendingResponseDrafts[interaction.id]?.trim() ?? "";
    if (draft.length === 0) return;

    setRespondingInteractionId(interaction.id);
    void respondToPendingInteraction(interaction.id, { text: draft, status: "answered" })
      .then((updated) => {
        if (!updated) return;
        setPendingResponseDrafts((current) => {
          const { [interaction.id]: _removed, ...rest } = current;
          return rest;
        });
      })
      .finally(() => setRespondingInteractionId(undefined));
  };

  useEffect(() => {
    if (!selectedDoc) return;

    setDocEditTitle(selectedDoc.title);
    setDocEditBody(selectedDoc.body);
    setDocEditStatus(selectedDoc.status);
  }, [selectedDoc]);

  useEffect(() => {
    if (!selectedDoc || !isApiBacked || selectedDocDetail) return;

    void loadActiveRoomDocDetail(selectedDoc.id);
  }, [isApiBacked, loadActiveRoomDocDetail, selectedDoc, selectedDocDetail]);

  useEffect(() => {
    if (!editingAnnouncement) return;

    setAnnouncementTitle(editingAnnouncement.title ?? "");
    setAnnouncementBody(editingAnnouncement.body);
  }, [editingAnnouncement]);

  useEffect(() => {
    if (!selectedActivityId) return;
    if (activityItems.some((item) => item.id === selectedActivityId)) return;

    setSelectedActivityId(undefined);
  }, [activityItems, selectedActivityId]);

  useEffect(() => {
    setTrajectoryExportStatus("idle");
    setTrajectoryExport(undefined);
    setTrajectoryExportError(undefined);
    setTrajectoryCopyStatus("idle");
  }, [selectedActivityRunId]);

  const handleTrajectoryExport = () => {
    if (!selectedActivityRunId || !isApiBacked || trajectoryExportStatus === "loading") return;

    setTrajectoryExportStatus("loading");
    setTrajectoryExport(undefined);
    setTrajectoryExportError(undefined);
    setTrajectoryCopyStatus("idle");

    void exportHarnessRunTrajectory(selectedActivityRunId)
      .then((result) => {
        setTrajectoryExport(result);
        setTrajectoryExportStatus("success");
      })
      .catch((error: unknown) => {
        setTrajectoryExportError(getErrorMessage(error));
        setTrajectoryExportStatus("error");
      });
  };

  const handleCopyTrajectoryExport = () => {
    if (!trajectoryExport) return;
    if (!navigator.clipboard) {
      setTrajectoryCopyStatus("error");
      return;
    }

    void navigator.clipboard
      .writeText(trajectoryExport.text)
      .then(() => setTrajectoryCopyStatus("copied"))
      .catch(() => setTrajectoryCopyStatus("error"));
  };

  return (
    <aside className="linka-scrollbar min-h-0 overflow-y-auto border-t border-line bg-[#f7f0e3]/90 p-3 lg:border-l lg:border-t-0">
      <div className="grid grid-cols-3 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`rounded-md border px-2 py-1.5 text-xs font-semibold ${
              tab.id === activeTab
                ? "border-linka/35 bg-[#f0ecff] text-linka"
                : "border-line bg-panel/72 text-muted hover:border-linka hover:text-linka"
            }`}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "info" ? (
        <section className="mt-4 grid gap-3">
          <div className="rounded-md border border-line bg-panel/72 p-3 shadow-sketch">
            <p className="font-mono text-[11px] uppercase text-linka">Room</p>
            <h2 className="mt-1 text-base font-semibold">{room?.displayName ?? "未选择 Room"}</h2>
            <p className="mt-2 text-xs leading-5 text-muted">{room?.topic ?? "暂无 topic"}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-line bg-panel/72 p-2">
              <p className="font-mono text-[11px] text-muted">成员</p>
              <p className="mt-1 text-lg font-semibold">{members.length}</p>
            </div>
            <div className="rounded-md border border-line bg-panel/72 p-2">
              <p className="font-mono text-[11px] text-muted">置顶</p>
              <p className="mt-1 text-lg font-semibold">{pins.length}</p>
            </div>
            <div className="rounded-md border border-line bg-panel/72 p-2">
              <p className="font-mono text-[11px] text-muted">Docs</p>
              <p className="mt-1 text-lg font-semibold">{docs.length}</p>
            </div>
            <div className="rounded-md border border-line bg-panel/72 p-2">
              <p className="font-mono text-[11px] text-muted">文件</p>
              <p className="mt-1 text-lg font-semibold">{files.length}</p>
            </div>
          </div>
          {room ? (
            <div className="rounded-md border border-line bg-[#fbf7ed] p-3 text-xs leading-5 text-muted shadow-sketch">
              <p>默认可见性：{room.defaultVisibility.scope}</p>
              <p>通知策略：{room.notificationPolicy.level}</p>
              <p>创建时间：{formatShortTime(room.createdAt)}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === "members" ? (
        <section className="mt-4 grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">成员 ({members.length})</h2>
            <button
              className="rounded-md border border-line bg-panel px-2 py-1 text-xs text-muted shadow-sketch disabled:cursor-not-allowed disabled:opacity-70"
              type="button"
              disabled
              title="邀请成员将在 Phase 30 后接入"
            >
              邀请
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {members.map((member) => (
              <button
                key={member.id}
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold shadow-sketch ${memberAccent(member.kind)}`}
                title={`${member.displayName} · ${member.kind}`}
                type="button"
                onClick={() => setSelectedMemberId(member.id)}
              >
                {member.displayName.slice(0, 1)}
              </button>
            ))}
          </div>
          <div className="grid gap-2">
            {members.map((member) => (
              <button
                key={member.id}
                className="rounded-md border border-line bg-panel/72 p-2.5 text-left shadow-sketch hover:border-linka"
                type="button"
                onClick={() => setSelectedMemberId(member.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{member.displayName}</span>
                  <span className="rounded-md border border-line bg-[#fbf7ed] px-2 py-0.5 font-mono text-[11px] text-muted">
                    {member.kind} · {member.role}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-muted">{permissionSummary(member)}</p>
              </button>
            ))}
          </div>
          {selectedMember ? (
            <section className="rounded-md border border-linka/30 bg-[#f0ecff] p-3 shadow-sketch">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{selectedMember.displayName}</h3>
                <button
                  className="rounded-md border border-linka/25 bg-panel px-2 py-1 text-xs text-linka"
                  type="button"
                  onClick={() => setSelectedMemberId(undefined)}
                >
                  收起
                </button>
              </div>
              <dl className="mt-2 grid gap-1 text-xs leading-5 text-muted">
                <div className="flex justify-between gap-3">
                  <dt>身份</dt>
                  <dd>{selectedMember.kind}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>角色</dt>
                  <dd>{selectedMember.role}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>状态</dt>
                  <dd>{selectedMember.status}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>权限</dt>
                  <dd className="text-right">{permissionSummary(selectedMember)}</dd>
                </div>
                {selectedMember.lastSeenAt ? (
                  <div className="flex justify-between gap-3">
                    <dt>最后可见</dt>
                    <dd>{formatShortTime(selectedMember.lastSeenAt)}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}
        </section>
      ) : null}

      {activeTab === "announcements" ? (
        <section className="mt-4 grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">公告板</h2>
            <span className="font-mono text-[11px] text-muted">{announcements.length}</span>
          </div>
          <form
            className="grid gap-2 rounded-md border border-line bg-panel/72 p-2.5 shadow-sketch"
            onSubmit={(event) => {
              event.preventDefault();

              if (
                !canWriteRoomContext ||
                trimmedAnnouncementBody.length === 0 ||
                isSavingAnnouncement
              ) {
                return;
              }

              setIsSavingAnnouncement(true);
              const title = announcementTitle.trim();
              const body = trimmedAnnouncementBody;
              const save = editingAnnouncementId
                ? updateActiveRoomAnnouncement(editingAnnouncementId as Announcement["id"], {
                    title: title.length > 0 ? title : null,
                    body,
                  })
                : createActiveRoomAnnouncement({
                    ...(title.length > 0 ? { title } : {}),
                    body,
                  });

              void save
                .finally(() => setIsSavingAnnouncement(false))
                .then((announcement) => {
                  if (!announcement) return;
                  setAnnouncementTitle("");
                  setAnnouncementBody("");
                  setEditingAnnouncementId(undefined);
                });
            }}
          >
            <input
              className="min-w-0 rounded-md border border-line bg-[#fbf7ed] px-2.5 py-2 text-sm text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-70"
              maxLength={80}
              placeholder="公告标题"
              type="text"
              value={announcementTitle}
              disabled={!canWriteRoomContext || isSavingAnnouncement}
              onChange={(event) => setAnnouncementTitle(event.target.value)}
            />
            <textarea
              className="min-h-20 resize-none rounded-md border border-line bg-[#fbf7ed] px-2.5 py-2 text-sm leading-5 text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-70"
              maxLength={360}
              placeholder={
                canWriteRoomContext ? "公告内容" : "需要选择 API-backed Room 后才能写入公告"
              }
              value={announcementBody}
              disabled={!canWriteRoomContext || isSavingAnnouncement}
              onChange={(event) => setAnnouncementBody(event.target.value)}
            />
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-white shadow-sketch hover:bg-linka disabled:cursor-not-allowed disabled:bg-muted"
                type="submit"
                disabled={
                  !canWriteRoomContext ||
                  trimmedAnnouncementBody.length === 0 ||
                  isSavingAnnouncement
                }
              >
                {isSavingAnnouncement ? "保存中" : editingAnnouncementId ? "保存公告" : "创建公告"}
              </button>
              {editingAnnouncementId ? (
                <button
                  className="rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-muted hover:border-linka hover:text-linka"
                  type="button"
                  disabled={isSavingAnnouncement}
                  onClick={() => {
                    setEditingAnnouncementId(undefined);
                    setAnnouncementTitle("");
                    setAnnouncementBody("");
                  }}
                >
                  取消
                </button>
              ) : null}
            </div>
          </form>
          {announcements.length > 0 ? (
            announcements.map((announcement) => (
              <article
                key={announcement.id}
                className="rounded-md border border-line bg-[#fff8df] p-2.5 shadow-sketch"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 break-words text-sm font-semibold">
                    {announcement.title ?? "公告"}
                  </h3>
                  <div className="flex shrink-0 gap-1">
                    <button
                      className="rounded-md border border-line bg-panel px-2 py-0.5 text-[11px] text-muted hover:border-linka hover:text-linka disabled:cursor-not-allowed disabled:opacity-70"
                      type="button"
                      disabled={!canWriteRoomContext || isSavingAnnouncement}
                      onClick={() => setEditingAnnouncementId(announcement.id)}
                    >
                      编辑
                    </button>
                    <button
                      className="rounded-md border border-danger/30 bg-panel px-2 py-0.5 text-[11px] text-danger disabled:cursor-not-allowed disabled:opacity-70"
                      type="button"
                      disabled={!canWriteRoomContext || deletingAnnouncementId === announcement.id}
                      onClick={() => {
                        if (!canWriteRoomContext) return;
                        setDeletingAnnouncementId(announcement.id);
                        void deleteActiveRoomAnnouncement(announcement.id).finally(() =>
                          setDeletingAnnouncementId(undefined),
                        );
                      }}
                    >
                      {deletingAnnouncementId === announcement.id ? "删除中" : "删除"}
                    </button>
                  </div>
                </div>
                <p className="mt-2 break-words text-xs leading-5 text-muted">{announcement.body}</p>
              </article>
            ))
          ) : (
            <p className="rounded-md border border-line bg-panel/62 p-3 text-xs leading-5 text-muted">
              暂无公告。
            </p>
          )}
          {!canWriteRoomContext ? (
            <p className="rounded-md border border-caution/30 bg-[#fff3d8] p-2.5 text-xs leading-5 text-caution">
              当前没有 API-backed Room，公告写入需要启动 LinkA daemon。
            </p>
          ) : null}
        </section>
      ) : null}

      {activeTab === "docs" ? (
        <section className="mt-4 grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">关联 Docs</h2>
            <span className="font-mono text-[11px] text-muted">{docs.length}</span>
          </div>
          <form
            className="grid gap-2 rounded-md border border-line bg-panel/72 p-2.5 shadow-sketch"
            onSubmit={(event) => {
              event.preventDefault();
              const nextTitle = docTitle.trim();

              if (nextTitle.length === 0 || isCreatingDoc) return;

              const nextBody = docBody.trim();

              void createActiveRoomDoc({
                title: nextTitle,
                ...(nextBody.length > 0 ? { body: nextBody } : {}),
                notifyLinkA: handoffToLinkA,
              }).then((doc) => {
                if (doc && useRoomStore.getState().errorMessage === undefined) {
                  setDocTitle("");
                  setDocBody("");
                  setSelectedDocId(doc.id);
                }
              });
            }}
          >
            <label className="sr-only" htmlFor="room-doc-title">
              文档标题
            </label>
            <input
              id="room-doc-title"
              className="min-w-0 rounded-md border border-line bg-[#fbf7ed] px-2.5 py-2 text-sm text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-70"
              maxLength={80}
              placeholder="新建 Doc / ToDo"
              type="text"
              value={docTitle}
              disabled={isCreatingDoc}
              onChange={(event) => setDocTitle(event.target.value)}
            />
            <label className="sr-only" htmlFor="room-doc-body">
              文档正文
            </label>
            <textarea
              id="room-doc-body"
              className="min-h-16 resize-none rounded-md border border-line bg-[#fbf7ed] px-2.5 py-2 text-sm leading-5 text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-70"
              maxLength={240}
              placeholder="任务目标、验收标准、资料链接..."
              value={docBody}
              disabled={isCreatingDoc}
              onChange={(event) => setDocBody(event.target.value)}
            />
            <label className="flex items-center gap-2 rounded-md border border-line bg-[#fbf7ed] px-2.5 py-2 text-xs text-muted">
              <input
                checked={handoffToLinkA}
                className="h-3.5 w-3.5 accent-[#7760dc]"
                type="checkbox"
                disabled={isCreatingDoc}
                onChange={(event) => setHandoffToLinkA(event.target.checked)}
              />
              创建后 @LinkA
            </label>
            <button
              className="rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-white shadow-sketch hover:bg-linka disabled:cursor-not-allowed disabled:bg-muted"
              type="submit"
              disabled={trimmedDocTitle.length === 0 || isCreatingDoc}
            >
              {isCreatingDoc ? "创建中" : handoffToLinkA ? "保存并交给 LinkA" : "新建 Doc"}
            </button>
          </form>

          {docs.length > 0 ? (
            <div className="grid gap-2">
              {docs.slice(0, 6).map((doc) => {
                const firstLine = getBodyFirstLine(doc.body);

                return (
                  <button
                    key={doc.id}
                    className={`rounded-md border p-2.5 text-left shadow-sketch hover:border-linka ${
                      selectedDoc?.id === doc.id
                        ? "border-linka/35 bg-[#f0ecff]"
                        : "border-line bg-panel/72"
                    }`}
                    type="button"
                    onClick={() => setSelectedDocId(doc.id)}
                  >
                    <h3 className="truncate text-sm font-semibold">{doc.title}</h3>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {doc.format} · {doc.status}
                    </p>
                    {firstLine ? (
                      <p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-muted">
                        {firstLine}
                      </p>
                    ) : (
                      <time
                        className="mt-2 block font-mono text-[11px] text-muted"
                        dateTime={new Date(doc.updatedAt).toISOString()}
                      >
                        更新于 {formatShortTime(doc.updatedAt)}
                      </time>
                    )}
                  </button>
                );
              })}
            </div>
          ) : null}

          {selectedDoc ? (
            <section className="rounded-md border border-linka/30 bg-panel/90 p-3 shadow-sketch">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] uppercase text-linka">Doc detail</p>
                  <h3 className="mt-1 truncate text-sm font-semibold">{selectedDoc.title}</h3>
                </div>
                <span className="rounded-md border border-line bg-[#fbf7ed] px-2 py-0.5 font-mono text-[11px] text-muted">
                  {selectedDoc.status}
                </span>
              </div>
              <form
                className="mt-3 grid gap-2"
                onSubmit={(event) => {
                  event.preventDefault();

                  if (!canWriteRoomContext || trimmedDocEditTitle.length === 0 || isSavingDoc)
                    return;

                  setIsSavingDoc(true);
                  void updateActiveRoomDoc(selectedDoc.id, {
                    title: trimmedDocEditTitle,
                    body: docEditBody,
                    status: docEditStatus,
                    summary: "Saved from MemberRail",
                  })
                    .then((doc) => {
                      if (doc) setSelectedDocId(doc.id);
                    })
                    .finally(() => setIsSavingDoc(false));
                }}
              >
                <input
                  className="min-w-0 rounded-md border border-line bg-[#fbf7ed] px-2.5 py-2 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-70"
                  maxLength={100}
                  value={docEditTitle}
                  disabled={!canWriteRoomContext || isSavingDoc}
                  onChange={(event) => setDocEditTitle(event.target.value)}
                />
                <textarea
                  className="min-h-36 resize-y rounded-md border border-line bg-[#fbf7ed] px-2.5 py-2 text-sm leading-5 text-ink disabled:cursor-not-allowed disabled:opacity-70"
                  value={docEditBody}
                  disabled={!canWriteRoomContext || isSavingDoc}
                  onChange={(event) => setDocEditBody(event.target.value)}
                />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <select
                    className="min-w-0 rounded-md border border-line bg-[#fbf7ed] px-2.5 py-1.5 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-70"
                    value={docEditStatus}
                    disabled={!canWriteRoomContext || isSavingDoc}
                    onChange={(event) => setDocEditStatus(event.target.value as DocStatus)}
                  >
                    <option value="draft">draft</option>
                    <option value="active">active</option>
                    <option value="archived">archived</option>
                  </select>
                  <button
                    className="rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-white shadow-sketch hover:bg-linka disabled:cursor-not-allowed disabled:bg-muted"
                    type="submit"
                    disabled={
                      !canWriteRoomContext || trimmedDocEditTitle.length === 0 || isSavingDoc
                    }
                  >
                    {isSavingDoc ? "保存中" : "保存"}
                  </button>
                </div>
              </form>

              <form
                className="mt-3 grid gap-2 rounded-md border border-line bg-[#fbf7ed] p-2"
                onSubmit={(event) => {
                  event.preventDefault();

                  if (
                    !canWriteRoomContext ||
                    trimmedDocCommentBody.length === 0 ||
                    isCommentingDoc
                  ) {
                    return;
                  }

                  setIsCommentingDoc(true);
                  void createActiveDocComment(selectedDoc.id, { body: trimmedDocCommentBody })
                    .then((comment) => {
                      if (comment) setDocCommentBody("");
                    })
                    .finally(() => setIsCommentingDoc(false));
                }}
              >
                <textarea
                  className="min-h-16 resize-none rounded-md border border-line bg-panel px-2.5 py-2 text-sm leading-5 text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-70"
                  maxLength={240}
                  placeholder={
                    canWriteRoomContext ? "添加评论" : "需要选择 API-backed Room 后才能评论"
                  }
                  value={docCommentBody}
                  disabled={!canWriteRoomContext || isCommentingDoc}
                  onChange={(event) => setDocCommentBody(event.target.value)}
                />
                <button
                  className="rounded-md border border-linka/35 bg-[#f0ecff] px-3 py-1.5 text-sm font-semibold text-linka disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={
                    !canWriteRoomContext || trimmedDocCommentBody.length === 0 || isCommentingDoc
                  }
                >
                  {isCommentingDoc ? "发送中" : "评论"}
                </button>
              </form>

              <div className="mt-3 grid gap-2">
                <h4 className="font-mono text-[11px] uppercase text-muted">
                  Versions ({selectedDocDetail?.revisions.length ?? 0})
                </h4>
                {selectedDocDetail?.revisions.length ? (
                  selectedDocDetail.revisions
                    .slice()
                    .reverse()
                    .map((revision) => (
                      <article
                        key={revision.id}
                        className="rounded-md border border-line bg-[#fbf7ed] p-2 text-xs leading-5 text-muted"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-ink">v{revision.revisionNumber}</span>
                          <time dateTime={new Date(revision.createdAt).toISOString()}>
                            {formatShortTime(revision.createdAt)}
                          </time>
                        </div>
                        <p className="mt-1 break-words">
                          {revision.summary ?? revision.title ?? "committed"}
                        </p>
                      </article>
                    ))
                ) : (
                  <p className="rounded-md border border-line bg-[#fbf7ed] p-2 text-xs text-muted">
                    {canWriteRoomContext ? "暂无版本记录" : "非 API Room 不加载版本记录"}
                  </p>
                )}
              </div>

              <div className="mt-3 grid gap-2">
                <h4 className="font-mono text-[11px] uppercase text-muted">
                  Comments ({selectedDocDetail?.comments.length ?? 0})
                </h4>
                {selectedDocDetail?.comments.length ? (
                  selectedDocDetail.comments.map((comment) => (
                    <article
                      key={comment.id}
                      className="rounded-md border border-line bg-[#fbf7ed] p-2 text-xs leading-5 text-muted"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ink">{comment.status}</span>
                        <time dateTime={new Date(comment.createdAt).toISOString()}>
                          {formatShortTime(comment.createdAt)}
                        </time>
                      </div>
                      <p className="mt-1 break-words">{comment.body}</p>
                    </article>
                  ))
                ) : (
                  <p className="rounded-md border border-line bg-[#fbf7ed] p-2 text-xs text-muted">
                    暂无评论
                  </p>
                )}
              </div>
              {!canWriteRoomContext ? (
                <p className="mt-3 rounded-md border border-caution/30 bg-[#fff3d8] p-2 text-xs leading-5 text-caution">
                  当前没有 API-backed Room，Doc 编辑、评论和版本加载需要启动 LinkA daemon。
                </p>
              ) : null}
            </section>
          ) : null}
        </section>
      ) : null}

      {activeTab === "activity" ? (
        <section className="mt-4 grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Agent 活动</h2>
            <span className="font-mono text-[11px] text-muted">
              {activityItems.length + requestedInteractions.length}
            </span>
          </div>

          {requestedInteractions.length > 0 ? (
            <div className="grid gap-2">
              {requestedInteractions.map((interaction) => {
                const draft = pendingResponseDrafts[interaction.id] ?? "";
                const isResponding = respondingInteractionId === interaction.id;

                return (
                  <article
                    key={interaction.id}
                    className="rounded-md border border-caution/35 bg-[#fff3d8] p-2.5 shadow-sketch"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="rounded-md border border-caution/30 bg-panel px-2 py-0.5 font-mono text-[11px] text-caution">
                          waiting user
                        </span>
                        <h3 className="mt-2 line-clamp-2 break-words text-sm font-semibold">
                          {pendingSummary(interaction)}
                        </h3>
                      </div>
                      <span className="shrink-0 rounded-md border border-caution/30 bg-panel px-2 py-0.5 font-mono text-[11px] text-caution">
                        {interaction.kind}
                      </span>
                    </div>
                    <textarea
                      className="mt-2 min-h-16 w-full resize-none rounded-md border border-line bg-panel px-2.5 py-2 text-sm leading-5 text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-70"
                      maxLength={360}
                      placeholder="写入用户回应，保存为 Room message"
                      value={draft}
                      disabled={!canWriteRoomContext || isResponding}
                      onChange={(event) =>
                        setPendingResponseDrafts((current) => ({
                          ...current,
                          [interaction.id]: event.target.value,
                        }))
                      }
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted">{interaction.id}</span>
                      <button
                        className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-white shadow-sketch hover:bg-linka disabled:cursor-not-allowed disabled:bg-muted"
                        type="button"
                        disabled={!canWriteRoomContext || draft.trim().length === 0 || isResponding}
                        onClick={() => handlePendingResponse(interaction)}
                      >
                        {isResponding ? "提交中" : "提交回应"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}

          {activityItems.length > 0 ? (
            <div className="grid gap-2">
              {activityItems.map((item) => (
                <button
                  key={item.id}
                  className={`rounded-md border p-2.5 text-left shadow-sketch hover:border-linka ${
                    selectedActivity?.id === item.id
                      ? "border-linka/35 bg-[#f0ecff]"
                      : "border-line bg-panel/72"
                  }`}
                  type="button"
                  onClick={() => setSelectedActivityId(item.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md border border-line bg-[#fbf7ed] px-2 py-0.5 font-mono text-[11px] text-muted">
                          {formatActivityLabel(item.kind)}
                        </span>
                        <span
                          className={`rounded-md border px-2 py-0.5 font-mono text-[11px] ${severityClass(item.severity)}`}
                        >
                          {item.severity}
                        </span>
                      </div>
                      <h3 className="mt-2 line-clamp-2 break-words text-sm font-semibold">
                        {item.title}
                      </h3>
                    </div>
                    <span
                      className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[11px] ${statusClass(item.status)}`}
                    >
                      {formatActivityLabel(item.status)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 break-words text-xs leading-5 text-muted">
                    {item.summary || "暂无摘要"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted">
                    <span>{item.agentDisplayName}</span>
                    <span>events {item.rawEventCount}</span>
                    <time dateTime={new Date(item.updatedAt).toISOString()}>
                      {formatShortTime(item.updatedAt)}
                    </time>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-line bg-panel/62 p-3 text-xs leading-5 text-muted">
              暂无 Agent 活动。启动 session 或触发 agent run 后，这里会显示 projection item。
            </p>
          )}

          {selectedActivity ? (
            <section className="rounded-md border border-linka/30 bg-panel/90 p-3 shadow-sketch">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] uppercase text-linka">Run detail</p>
                  <h3 className="mt-1 line-clamp-2 break-words text-sm font-semibold">
                    {selectedActivity.title}
                  </h3>
                </div>
                <button
                  className="rounded-md border border-line bg-[#fbf7ed] px-2 py-0.5 text-[11px] text-muted hover:border-linka hover:text-linka"
                  type="button"
                  onClick={() => setSelectedActivityId(undefined)}
                >
                  收起
                </button>
              </div>

              <dl className="mt-3 grid gap-1 text-xs leading-5 text-muted">
                <div className="flex justify-between gap-3">
                  <dt>agent</dt>
                  <dd className="text-right">{selectedActivity.agentDisplayName}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>runId</dt>
                  <dd className="break-all text-right font-mono">
                    {selectedActivity.runId ?? "n/a"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>sessionId</dt>
                  <dd className="break-all text-right font-mono">
                    {selectedActivity.sessionId ?? "n/a"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>triggerId</dt>
                  <dd className="break-all text-right font-mono">
                    {selectedActivity.triggerId ?? "n/a"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>rawEventCount</dt>
                  <dd>{selectedActivity.rawEventCount}</dd>
                </div>
              </dl>

              <div className="mt-3 grid gap-2 rounded-md border border-line bg-[#fbf7ed] p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="font-mono text-[11px] uppercase text-muted">
                      Trajectory export
                    </h4>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {selectedActivityRunId
                        ? isApiBacked
                          ? `状态：${trajectoryExportStatus}`
                          : "当前没有 API-backed Room，导出需要启动 LinkA daemon。"
                        : "该活动没有 runId，无法导出 trajectory。"}
                    </p>
                  </div>
                  <button
                    className="rounded-md border border-linka/30 bg-panel px-2 py-1 text-xs font-semibold text-linka hover:border-linka disabled:cursor-not-allowed disabled:border-line disabled:text-muted disabled:opacity-70"
                    type="button"
                    disabled={
                      !selectedActivityRunId || !isApiBacked || trajectoryExportStatus === "loading"
                    }
                    onClick={handleTrajectoryExport}
                  >
                    {trajectoryExportStatus === "loading" ? "导出中" : "导出 trajectory"}
                  </button>
                </div>

                {trajectoryExportStatus === "error" ? (
                  <p className="rounded-md border border-danger/30 bg-[#fae8e2] p-2 text-xs leading-5 text-danger">
                    {trajectoryExportError ?? "导出 trajectory 失败"}
                  </p>
                ) : null}

                {trajectoryExportStatus === "success" && trajectoryExport ? (
                  <div className="grid gap-2">
                    <dl className="grid gap-1 text-xs leading-5 text-muted">
                      <div className="flex justify-between gap-3">
                        <dt>runId</dt>
                        <dd className="break-all text-right font-mono">
                          {trajectoryExport.record.metadata.runId}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>snapshotId</dt>
                        <dd className="break-all text-right font-mono">
                          {trajectoryExport.record.metadata.snapshotId}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>version</dt>
                        <dd className="break-all text-right font-mono">
                          {trajectoryExport.record.metadata.version}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>format</dt>
                        <dd className="break-all text-right font-mono">
                          {trajectoryExport.record.metadata.format}
                        </dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] uppercase text-muted">
                        JSONL preview
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted">
                          copy: {trajectoryCopyStatus}
                        </span>
                        <button
                          className="rounded-md border border-line bg-panel px-2 py-0.5 text-[11px] text-muted hover:border-linka hover:text-linka"
                          type="button"
                          onClick={handleCopyTrajectoryExport}
                        >
                          复制 raw
                        </button>
                      </div>
                    </div>
                    <pre className="max-h-64 overflow-auto rounded-md border border-line bg-[#1f2421] p-2 font-mono text-[11px] leading-5 text-[#fbf7ed]">
                      {trajectoryExportPreview}
                    </pre>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2">
                <h4 className="font-mono text-[11px] uppercase text-muted">
                  Raw runtime events ({selectedActivityRawEvents.length})
                </h4>
                {selectedActivityRawEvents.length > 0 ? (
                  selectedActivityRawEvents.map((event) => (
                    <article
                      key={event.id}
                      className="rounded-md border border-line bg-[#fbf7ed] p-2 text-xs leading-5 text-muted"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px]">
                        <span>#{event.sequence}</span>
                        <span>{event.type}</span>
                        <span>{event.payload.kind}</span>
                      </div>
                      <p className="mt-1 break-words">{runtimeEventSummary(event)}</p>
                    </article>
                  ))
                ) : (
                  <p className="rounded-md border border-line bg-[#fbf7ed] p-2 text-xs text-muted">
                    暂无 raw runtime events。
                  </p>
                )}
              </div>
            </section>
          ) : null}
        </section>
      ) : null}

      {activeTab === "files" ? (
        <section className="mt-4 grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">群文件</h2>
            <button
              className="rounded-md border border-line bg-panel px-2 py-1 text-xs text-muted disabled:cursor-not-allowed disabled:opacity-70"
              type="button"
              disabled
              title="上传文件将在后续文件阶段接入"
            >
              上传
            </button>
          </div>
          {files.length > 0 ? (
            files.map((file) => (
              <article
                key={file.id}
                className="rounded-md border border-line bg-panel/72 p-2.5 shadow-sketch"
              >
                <h3 className="truncate text-sm font-semibold">{file.name}</h3>
                <p className="mt-1 font-mono text-[11px] text-muted">
                  {file.contentType ?? "file"} ·{" "}
                  {file.sizeBytes ? `${Math.round(file.sizeBytes / 1024)} KB` : "size n/a"}
                </p>
              </article>
            ))
          ) : (
            <p className="rounded-md border border-line bg-panel/62 p-3 text-xs leading-5 text-muted">
              暂无文件。
            </p>
          )}
        </section>
      ) : null}
    </aside>
  );
};
