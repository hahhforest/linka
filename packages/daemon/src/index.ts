export const daemonPackageName = "@linka/daemon";

if (process.env.LINKA_DAEMON_ONCE === "1") {
  console.log("linka daemon scaffold ready");
}
