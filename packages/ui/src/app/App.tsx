import { useEffect } from "react";

import { RoomWorkspace } from "../components/shell/RoomWorkspace.js";
import { useConnectionStore } from "../store/connectionStore.js";
import { useRoomStore } from "../store/roomStore.js";

export const App = () => {
  const checkDaemonConnection = useConnectionStore((state) => state.checkDaemonConnection);
  const initializeRoomWorkspace = useRoomStore((state) => state.initializeRoomWorkspace);

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

  return <RoomWorkspace />;
};
