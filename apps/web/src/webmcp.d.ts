// Tipos mínimos de WebMCP (API imperativa de Chrome: document.modelContext). Experimental; ver lib/webmcp/.
interface ModelContextToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
  consequentialHint?: boolean;
}
interface ModelContextTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: ModelContextToolAnnotations;
  execute: (input: unknown, opts?: { signal?: AbortSignal }) => Promise<unknown>;
}
interface ModelContext {
  registerTool: (tool: ModelContextTool, opts?: { signal?: AbortSignal }) => Promise<void> | void;
}
interface Document {
  /** Solo en navegadores con WebMCP (origin trial o flag) */
  readonly modelContext?: ModelContext;
}
interface ImportMetaEnv {
  /** Token del origin trial de WebMCP para el origen de producción (opcional) */
  readonly VITE_WEBMCP_OT_TOKEN?: string;
}
