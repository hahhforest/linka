import { useEffect } from "react";

import { RoomWorkspace } from "../components/shell/RoomWorkspace.js";
import { useConnectionStore } from "../store/connectionStore.js";
import { useRealtimeStore } from "../store/realtimeStore.js";
import { useRoomStore } from "../store/roomStore.js";

export const App = () => {
  const checkDaemonConnection = useConnectionStore((state) => state.checkDaemonConnection);
  const initializeRoomWorkspace = useRoomStore((state) => state.initializeRoomWorkspace);
  const roomSource = useRoomStore((state) => state.source);
  const activeRoomId = useRoomStore((state) => state.activeRoomId);
  const applyRoomEvent = useRoomStore((state) => state.applyRoomEvent);
  const connectRealtime = useRealtimeStore((state) => state.connect);
  const disconnectRealtime = useRealtimeStore((state) => state.disconnect);

  useEffect(() => {
    void initializeRoomWorkspace();
  }, [initializeRoomWorkspace]);

  useEffect(() => {
    void checkDaemonConnection();
    const intervalId = window.setInterval(() => {
      void checkDaemonConnection();
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, [checkDaemonConnection]);

  useEffect(() => {
    if (roomSource === "api" && activeRoomId) {
      connectRealtime({ onRoomEvent: applyRoomEvent });
      return () => disconnectRealtime();
    }

    disconnectRealtime();
    return undefined;
  }, [activeRoomId, applyRoomEvent, connectRealtime, disconnectRealtime, roomSource]);

  return <RoomWorkspace />;
};
