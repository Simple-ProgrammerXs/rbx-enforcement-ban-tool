import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { startIntegratedWorker } from "./start/worker";

startIntegratedWorker();

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request);
  },
});
