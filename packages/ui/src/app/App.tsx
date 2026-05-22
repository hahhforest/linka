import { useEffect } from "react";

import { RoomWorkspace } from "../components/shell/RoomWorkspace.js";
import { useConnectionStore } from "../store/connectionStore.js";
import { useRealtimeStore } from "../store/realtimeStore.js";
import { useRoomStore } from "../store/roomStore.js";

export const App = () => {
  const checkDaemonConnection = useConnectionStore((state) => state.checkDaemonConnection);
  const daemonStatus = useConnectionStore((state) => state.status);
  const initializeRoomWorkspace = useRoomStore((state) => state.initializeRoomWorkspace);
  const roomSource = useRoomStore((state) => state.source);
  const activeRoomId = useRoomStore((state) => state.activeRoomId);
  const applyRoomEvent = useRoomStore((state) => state.applyRoomEvent);
  const refreshActiveRoom = useRoomStore((state) => state.refreshActiveRoom);
  const connectRealtime = useRealtimeStore((state) => state.connect);
  const disconnectRealtime = useRealtimeStore((state) => state.disconnect);

  useEffect(() => {
    void initializeRoomWorkspace();
  }, [initializeRoomWorkspace]);

  useEffect(() => {
    if (daemonStatus === "online" && (roomSource === "offline" || roomSource === "demo")) {
      void initializeRoomWorkspace();
    }
  }, [daemonStatus, initializeRoomWorkspace, roomSource]);

  useEffect(() => {
    void checkDaemonConnection();
    const intervalId = window.setInterval(() => {
      void checkDaemonConnection();
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, [checkDaemonConnection]);

  useEffect(() => () => disconnectRealtime(), [disconnectRealtime]);

  useEffect(() => {
    if (daemonStatus === "offline" || daemonStatus === "error" || roomSource !== "api") {
      disconnectRealtime();
      return;
    }

    if (daemonStatus === "online" && activeRoomId) {
      connectRealtime({ onRoomEvent: applyRoomEvent });
    }
  }, [activeRoomId, applyRoomEvent, connectRealtime, daemonStatus, disconnectRealtime, roomSource]);

  useEffect(() => {
    if (daemonStatus !== "online" || roomSource !== "api" || !activeRoomId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshActiveRoom();
    }, 3_000);

    return () => window.clearInterval(intervalId);
  }, [activeRoomId, daemonStatus, refreshActiveRoom, roomSource]);

  return <RoomWorkspace />;
};
