import { useEffect } from "react";

import { demoRoom } from "../fixtures/demoRoom.js";
import { useConnectionStore } from "../store/connectionStore.js";
import { RoomWorkspace } from "../components/shell/RoomWorkspace.js";

export const App = () => {
  const checkDaemonConnection = useConnectionStore((state) => state.checkDaemonConnection);

  useEffect(() => {
    void checkDaemonConnection();
    const intervalId = window.setInterval(() => {
      void checkDaemonConnection();
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, [checkDaemonConnection]);

  return <RoomWorkspace demoRoom={demoRoom} />;
};
