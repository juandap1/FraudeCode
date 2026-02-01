import useFraudeStore from "@/store/useFraudeStore";
import type { Server } from "bun";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type Handler = (req: Request) => Response | Promise<Response>;
const { updateOutput } = useFraudeStore.getState();

interface Route {
  method: HttpMethod;
  path: string;
  handler: Handler;
}

export interface WebSocketHandler {
  open?: (ws: any) => void;
  message: (ws: any, message: string) => void;
  close?: (ws: any) => void;
}

export class BunApiRouter {
  private static routers = new Map<string, BunApiRouter>();
  private static _shared: BunApiRouter;

  public static get shared(): BunApiRouter {
    if (!this._shared) {
      this._shared = new BunApiRouter();
    }
    return this._shared;
  }

  public static getRouter(id: string): BunApiRouter | undefined {
    return this.routers.get(id);
  }
  private id: string = crypto.randomUUID();
  public port: number = 3000;
  private routes: Route[] = [];
  private wsRoutes: { path: string; handler: WebSocketHandler }[] = [];
  private server: Server<any> | null = null;
  private resolveServicePromise: (() => void) | null = null;

  public static stopRouter(id: string) {
    const router = this.routers.get(id);
    if (router) {
      router.stop();
      this.routers.delete(id);
    }
  }

  /**
   * Check if a route pattern matches a given pathname and extract params
   * Supports dynamic segments like :userId
   */
  private getParams(
    pattern: string,
    pathname: string,
  ): Record<string, string> | null {
    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = pathname.split("/").filter(Boolean);

    if (patternParts.length !== pathParts.length) {
      return null;
    }

    const params: Record<string, string> = {};

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i]!;
      const pathPart = pathParts[i]!;

      if (patternPart.startsWith(":")) {
        const paramName = patternPart.slice(1);
        params[paramName] = pathPart;
      } else if (patternPart !== pathPart) {
        return null;
      }
    }

    return params;
  }

  /**
   * Register a new endpoint
   * @param method HTTP Method
   * @param path URL path (e.g. "/api/v1/users" or "/users/:id")
   * @param handler Function to handle the request
   */
  public register(
    method: HttpMethod,
    path: string,
    handler: (req: Request & { params: Record<string, string> }) => any,
  ) {
    // Check for duplicates
    const duplicate = this.routes.find(
      (r) => r.method === method && r.path === path,
    );

    if (duplicate) {
      updateOutput(
        "log",
        `[Router] Warning: Duplicate route registration attempted: ${method} ${path}. skipping.`,
      );
      return;
    }

    this.routes.push({ method, path, handler: handler as any });
  }

  /**
   * Register a WebSocket endpoint
   * @param path URL path
   * @param handler WebSocket event handlers
   */
  public registerWebSocket(path: string, handler: WebSocketHandler) {
    this.wsRoutes.push({ path, handler });
  }

  /**
   * Start the server and block until interrupted.
   * @param port Port to listen on (default: 3000)
   */
  public async serve(port: number = 3000): Promise<void> {
    this.port = port;

    // Create a promise that we can manually resolve to "unblock" the caller
    const servicePromise = new Promise<void>((resolve) => {
      this.resolveServicePromise = resolve;
    });

    this.server = Bun.serve<{
      handler: WebSocketHandler;
      params: Record<string, string>;
    }>({
      port,
      idleTimeout: 180,
      fetch: async (req, server) => {
        const url = new URL(req.url);

        // Check for WebSocket upgrade
        let wsParams: Record<string, string> = {};
        const wsRoute = this.wsRoutes.find((r) => {
          const p = this.getParams(r.path, url.pathname);
          if (p) {
            wsParams = p;
            return true;
          }
          return false;
        });

        if (
          wsRoute &&
          server.upgrade(req, {
            data: { handler: wsRoute.handler, params: wsParams },
          })
        ) {
          return undefined;
        }

        // CORS support
        const corsHeaders = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods":
            "GET, POST, PUT, DELETE, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        };

        if (req.method === "OPTIONS") {
          return new Response(null, { headers: corsHeaders });
        }

        // Default health check
        if (url.pathname === "/health" && req.method === "GET") {
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        // Find matching route and extract params
        let params: Record<string, string> = {};
        const route = this.routes.find((r) => {
          if (r.method !== req.method) return false;
          const p = this.getParams(r.path, url.pathname);
          if (p) {
            params = p;
            return true;
          }
          return false;
        });

        if (route) {
          try {
            // Attach params to request object
            (req as any).params = params;
            const response = await route.handler(req);
            // Append CORS headers to the handler's response
            const newHeaders = new Headers(response.headers);
            Object.entries(corsHeaders).forEach(([key, value]) => {
              newHeaders.set(key, value);
            });
            return new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: newHeaders,
            });
          } catch (error) {
            console.error("Error in handler:", error);
            return new Response("Internal Server Error", {
              status: 500,
              headers: corsHeaders,
            });
          }
        }

        return new Response("Not Found", {
          status: 404,
          headers: corsHeaders,
        });
      },
      websocket: {
        open(ws) {
          if (ws.data?.handler?.open) {
            ws.data.handler.open(ws);
          }
        },
        message(ws, message) {
          if (ws.data?.handler?.message) {
            ws.data.handler.message(
              ws,
              typeof message === "string" ? message : message.toString(),
            );
          }
        },
        close(ws) {
          if (ws.data?.handler?.close) {
            ws.data.handler.close(ws);
          }
        },
      },
    });

    // Register this router instance
    BunApiRouter.routers.set(this.id, this);

    // Output the interactive component
    updateOutput("interactive-server", this.id);

    // Block until stopped
    await servicePromise;

    // Cleanup
    if (this.server) {
      this.server.stop();
    }

    BunApiRouter.routers.delete(this.id);
  }

  public stop() {
    if (this.resolveServicePromise) {
      this.resolveServicePromise();
      this.resolveServicePromise = null;
    }
  }
}
