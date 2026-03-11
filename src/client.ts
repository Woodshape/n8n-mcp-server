export class N8nClient {
  private sessionCookie: string | null = null;

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private email?: string,
    private password?: string,
  ) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async get<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const opts: RequestInit = {
      method,
      headers: { ...this.headers(), "Content-Type": "application/json" },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${this.baseUrl}${path}`, opts);
    if (!res.ok) {
      throw new Error(
        `${method} ${path} failed: ${res.status} ${await res.text()}`,
      );
    }
    return res.json() as Promise<T>;
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(
        `POST ${path} failed: ${res.status} ${await res.text()}`,
      );
    }
    return res.json() as Promise<T>;
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(
        `PUT ${path} failed: ${res.status} ${await res.text()}`,
      );
    }
    return res.json() as Promise<T>;
  }

  async delete<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(
        `DELETE ${path} failed: ${res.status} ${await res.text()}`,
      );
    }
    return res.json() as Promise<T>;
  }

  /** GET using session cookie auth (for internal endpoints like /types/nodes.json) */
  async getInternal<T = unknown>(path: string): Promise<T> {
    await this.ensureSession();
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        Cookie: this.sessionCookie!,
      },
    });
    if (!res.ok) {
      throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  private async ensureSession(): Promise<void> {
    if (this.sessionCookie) return;
    if (!this.email || !this.password) {
      throw new Error(
        "N8N_EMAIL and N8N_PASSWORD env vars required for internal endpoints (e.g. node type lookup)",
      );
    }
    const res = await fetch(`${this.baseUrl}/rest/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailOrLdapLoginId: this.email, password: this.password }),
    });
    if (!res.ok) {
      throw new Error(
        `Session login failed: ${res.status} ${await res.text()}`,
      );
    }
    const setCookie = res.headers.getSetCookie?.() ?? [];
    this.sessionCookie = setCookie.map((c) => c.split(";")[0]).join("; ");
    if (!this.sessionCookie) {
      throw new Error("Login succeeded but no session cookie returned");
    }
  }

  private headers(): Record<string, string> {
    return { "X-N8N-API-KEY": this.apiKey, Accept: "application/json" };
  }
}
