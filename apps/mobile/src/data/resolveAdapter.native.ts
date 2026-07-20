import type { CachedAuthStatus } from "../auth/status";
import { cloudApiBaseUrl } from "../auth/cloud";
import { LocalAdapter } from "./LocalAdapter";
import { MirrorAdapter } from "./MirrorAdapter";
import { RemoteAdapter } from "./RemoteAdapter";
import type { DataAdapter } from "./DataAdapter";

export function resolveAdapter(status: CachedAuthStatus): { adapter: DataAdapter; status: CachedAuthStatus } {
  const local = new LocalAdapter(status.profileId);
  if (status.testMode || !status.subscribed) return { adapter: local, status };
  const remote = new RemoteAdapter({
    baseUrl: cloudApiBaseUrl(),
    profileId: status.profileId,
    accessToken: status.accessToken
  });
  return { adapter: status.localMirror ? new MirrorAdapter(remote, local) : remote, status };
}
