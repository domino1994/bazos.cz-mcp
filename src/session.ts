import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export interface SessionData {
  phone?: string;
  cookies: Record<string, string>;
}

export function defaultSessionPath(): string {
  return process.env.BAZOS_SESSION_PATH || path.join(homedir(), ".config", "bazos-mcp", "session.json");
}

export class SessionStore {
  readonly cookies = new Map<string, string>();
  phone?: string;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const data = JSON.parse(raw) as SessionData;
      this.cookies.clear();
      for (const [key, value] of Object.entries(data.cookies ?? {})) {
        this.cookies.set(key, value);
      }
      this.phone = data.phone;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }

    if (process.env.BAZOS_BID) this.cookies.set("bid", process.env.BAZOS_BID);
    if (process.env.BAZOS_BKOD) this.cookies.set("bkod", process.env.BAZOS_BKOD);
    if (process.env.BAZOS_PHONE) this.phone = process.env.BAZOS_PHONE;
  }

  async save(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const data: SessionData = {
      phone: this.phone,
      cookies: Object.fromEntries(this.cookies),
    };
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  }

  async clear(): Promise<void> {
    this.cookies.clear();
    this.phone = undefined;
    await rm(this.filePath, { force: true });
  }

  header(): string {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  absorb(response: Response): void {
    const lines = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
    for (const line of lines) {
      const pair = line.split(";")[0] ?? "";
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!name) continue;
      this.cookies.set(name, value);
    }
  }

  status() {
    return {
      session_path: this.filePath,
      phone: this.phone ?? null,
      has_bid: this.cookies.has("bid"),
      has_bkod: this.cookies.has("bkod"),
      authenticated: this.cookies.has("bid") && this.cookies.has("bkod"),
    };
  }
}
