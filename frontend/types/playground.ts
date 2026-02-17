export interface LLMProvider {
  id: string
  name: string
  provider_type: "openai" | "anthropic" | "google" | "ollama" | "openrouter" | "custom"
  base_url?: string
  model_id: string
  is_active: boolean
  config?: Record<string, unknown>
  secret_id?: string
  created_at: string
}

export interface Agent {
  id: string
  name: string
  description?: string
  system_prompt?: string
  provider_id?: string
  tools?: string[]
  mcp_server_ids?: string[]
  config?: Record<string, unknown>
  is_active: boolean
  created_at: string
}

export interface Team {
  id: string
  name: string
  description?: string
  mode: "coordinate" | "route" | "collaborate"
  agent_ids: string[]
  config?: Record<string, unknown>
  is_active: boolean
  created_at: string
}

export interface Session {
  id: string
  title?: string
  entity_type: "agent" | "team" | "workflow"
  entity_id: string
  is_active: boolean
  created_at: string
  updated_at?: string
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown> | string
  result?: string
  status: "pending" | "running" | "completed" | "error"
}

export interface ReasoningStep {
  type: "thinking" | "planning" | "reflection"
  content: string
}

export interface AgentStep {
  agent_id: string
  agent_name: string
  step: "routing" | "responding" | "completed" | "synthesizing" | "selected"
}

export interface ToolRound {
  round: number
  max_rounds: number
}

export interface MessageMetadata {
  model?: string
  tokens_used?: { prompt: number; completion: number; total: number }
  latency_ms?: number
  provider?: string
  team_mode?: "coordinate" | "route" | "collaborate"
  contributing_agents?: { id: string; name: string }[]
  chain_agents?: { id: string; name: string }[]
}

export interface FileAttachment {
  id?: string
  filename: string
  media_type: string
  file_type: "image" | "document"
  url?: string
  data?: string
}

export interface Message {
  id: string
  session_id: string
  role: "user" | "assistant" | "system" | "tool"
  content?: string
  agent_id?: string
  tool_calls?: ToolCall[]
  reasoning?: ReasoningStep[]
  metadata?: MessageMetadata
  attachments?: FileAttachment[]
  created_at: string
}

export type StreamEvent =
  | { type: "content_delta"; content: string }
  | { type: "tool_call_start"; tool_call: ToolCall }
  | { type: "tool_call_result"; tool_call_id: string; result: string }
  | { type: "reasoning_delta"; reasoning: ReasoningStep }
  | { type: "agent_step"; agent_id: string; agent_name: string; step: string }
  | { type: "message_complete"; message: Message }
  | { type: "error"; error: string }
  | { type: "done" }

export interface Secret {
  id: string
  name: string
  masked_value: string
  description?: string
  created_at: string
  updated_at?: string
}

export interface CreateProviderRequest {
  name: string
  provider_type: string
  base_url?: string
  api_key?: string
  secret_id?: string
  model_id: string
  config?: Record<string, unknown>
}

export interface CreateAgentRequest {
  name: string
  description?: string
  system_prompt?: string
  provider_id?: string
  tools?: string[]
  mcp_server_ids?: string[]
  config?: Record<string, unknown>
}

export interface UpdateAgentRequest {
  name?: string
  description?: string
  system_prompt?: string
  provider_id?: string
  tools?: string[]
  mcp_server_ids?: string[]
  config?: Record<string, unknown>
}

export interface CreateTeamRequest {
  name: string
  description?: string
  mode?: string
  agent_ids: string[]
  config?: Record<string, unknown>
}

export interface CreateSessionRequest {
  entity_type: "agent" | "team" | "workflow"
  entity_id: string
  title?: string
}

// Workflows
export interface WorkflowStep {
  agent_id: string
  task: string
  order: number
  config?: Record<string, unknown>
}

export interface Workflow {
  id: string
  name: string
  description?: string
  steps: WorkflowStep[]
  config?: Record<string, unknown>
  is_active: boolean
  created_at: string
}

export interface CreateWorkflowRequest {
  name: string
  description?: string
  steps: WorkflowStep[]
  config?: Record<string, unknown>
}

export interface UpdateWorkflowRequest {
  name?: string
  description?: string
  steps?: WorkflowStep[]
  config?: Record<string, unknown>
}

// Workflow Runs
export interface WorkflowStepResult {
  order: number
  agent_id: string
  agent_name: string
  task: string
  status: "pending" | "running" | "completed" | "failed"
  output?: string
  started_at?: string
  completed_at?: string
  error?: string
}

export interface WorkflowRun {
  id: string
  workflow_id: string
  session_id?: string
  status: "running" | "completed" | "failed" | "cancelled"
  current_step: number
  steps: WorkflowStepResult[]
  input_text?: string
  final_output?: string
  error?: string
  started_at: string
  completed_at?: string
}

// Tool Definitions
export interface ToolDefinition {
  id: string
  name: string
  description?: string
  parameters: Record<string, unknown>
  handler_type: "http" | "python" | "builtin"
  handler_config?: Record<string, unknown>
  is_active: boolean
  created_at: string
}

export interface CreateToolRequest {
  name: string
  description?: string
  parameters: Record<string, unknown>
  handler_type?: string
  handler_config?: Record<string, unknown>
}

export interface UpdateToolRequest {
  name?: string
  description?: string
  parameters?: Record<string, unknown>
  handler_type?: string
  handler_config?: Record<string, unknown>
}

// MCP Servers
export interface MCPServer {
  id: string
  name: string
  description?: string
  transport_type: "stdio" | "sse"
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  is_active: boolean
  created_at: string
}

export interface CreateMCPServerRequest {
  name: string
  description?: string
  transport_type: "stdio" | "sse"
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export interface UpdateMCPServerRequest {
  name?: string
  description?: string
  transport_type?: "stdio" | "sse"
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

// Dashboard
export interface DashboardSummary {
  agents_count: number
  teams_count: number
  workflows_count: number
  sessions_count: number
}

// Admin
export interface UserPermissions {
  create_agents: boolean
  create_teams: boolean
  create_workflows: boolean
  create_tools: boolean
  manage_providers: boolean
  manage_mcp_servers: boolean
}

export const DEFAULT_PERMISSIONS: UserPermissions = {
  create_agents: true,
  create_teams: true,
  create_workflows: true,
  create_tools: true,
  manage_providers: true,
  manage_mcp_servers: true,
}

export const PERMISSION_LABELS: Record<keyof UserPermissions, string> = {
  create_agents: "Create Agents",
  create_teams: "Create Teams",
  create_workflows: "Create Workflows",
  create_tools: "Create Tools",
  manage_providers: "Manage Providers",
  manage_mcp_servers: "Manage MCP Servers",
}

export interface AdminUser {
  id: string
  username: string
  email: string
  role: string
  permissions: UserPermissions
  created_at?: string
}

export interface CreateUserRequest {
  username: string
  email: string
  password: string
  role: string
  permissions?: UserPermissions
}

export interface UpdateUserRequest {
  role?: string
  permissions?: UserPermissions
}
