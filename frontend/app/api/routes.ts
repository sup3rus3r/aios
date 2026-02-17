


export const AppRoutes = {
    // Existing
    GetHealth           : () => "/api/health",
    GetUserDetails      : () => "/api/get_user_details",
    ToggleRole          : () => "/api/user/toggle-role",

    // Providers
    ListProviders       : () => "/api/providers",
    CreateProvider      : () => "/api/providers",
    GetProvider         : (id: string) => `/api/providers/${id}`,
    UpdateProvider      : (id: string) => `/api/providers/${id}`,
    DeleteProvider      : (id: string) => `/api/providers/${id}`,
    TestProvider        : (id: string) => `/api/providers/${id}/test`,
    ListModels          : (id: string) => `/api/providers/${id}/models`,

    // Agents
    ListAgents          : () => "/api/agents",
    CreateAgent         : () => "/api/agents",
    GetAgent            : (id: string) => `/api/agents/${id}`,
    UpdateAgent         : (id: string) => `/api/agents/${id}`,
    DeleteAgent         : (id: string) => `/api/agents/${id}`,

    // Teams
    ListTeams           : () => "/api/teams",
    CreateTeam          : () => "/api/teams",
    GetTeam             : (id: string) => `/api/teams/${id}`,
    UpdateTeam          : (id: string) => `/api/teams/${id}`,
    DeleteTeam          : (id: string) => `/api/teams/${id}`,

    // Sessions
    ListSessions        : () => "/api/sessions",
    CreateSession       : () => "/api/sessions",
    GetSession          : (id: string) => `/api/sessions/${id}`,
    GetSessionMessages  : (id: string) => `/api/sessions/${id}/messages`,
    DeleteSession       : (id: string) => `/api/sessions/${id}`,

    // Workflows
    ListWorkflows       : () => "/api/workflows",
    CreateWorkflow      : () => "/api/workflows",
    GetWorkflow         : (id: string) => `/api/workflows/${id}`,
    UpdateWorkflow      : (id: string) => `/api/workflows/${id}`,
    DeleteWorkflow      : (id: string) => `/api/workflows/${id}`,

    // Workflow Runs
    RunWorkflow         : (id: string) => `/api/workflows/${id}/run`,
    ListWorkflowRuns    : (id: string) => `/api/workflows/${id}/runs`,
    GetWorkflowRun      : (id: string) => `/api/workflow-runs/${id}`,

    // Tools
    ListTools           : () => "/api/tools",
    CreateTool          : () => "/api/tools",
    GetTool             : (id: string) => `/api/tools/${id}`,
    UpdateTool          : (id: string) => `/api/tools/${id}`,
    DeleteTool          : (id: string) => `/api/tools/${id}`,

    // MCP Servers
    ListMCPServers      : () => "/api/mcp-servers",
    CreateMCPServer     : () => "/api/mcp-servers",
    GetMCPServer        : (id: string) => `/api/mcp-servers/${id}`,
    UpdateMCPServer     : (id: string) => `/api/mcp-servers/${id}`,
    DeleteMCPServer     : (id: string) => `/api/mcp-servers/${id}`,
    TestMCPServer       : (id: string) => `/api/mcp-servers/${id}/test`,
    TestMCPConfig       : () => "/api/mcp-servers/test-config",

    // Dashboard
    DashboardSummary    : () => "/api/dashboard/summary",

    // Chat
    Chat                : () => "/api/chat",

    // Security / Settings
    ChangePassword      : () => "/api/user/change-password",
    TOTPSetup           : () => "/api/user/2fa/setup",
    TOTPVerify          : () => "/api/user/2fa/verify",
    TOTPDisable         : () => "/api/user/2fa/disable",
    TOTPStatus          : () => "/api/user/2fa/status",
    TOTPLoginVerify     : () => "/api/user/2fa/login-verify",

    // Secrets
    ListSecrets         : () => "/api/secrets",
    CreateSecret        : () => "/api/secrets",
    UpdateSecret        : (id: string) => `/api/secrets/${id}`,
    DeleteSecret        : (id: string) => `/api/secrets/${id}`,

    // Files
    GetFile             : (id: string) => `/api/files/${id}`,

    // Admin
    AdminListUsers      : () => "/api/admin/users",
    AdminCreateUser     : () => "/api/admin/users",
    AdminUpdateUser     : (id: string) => `/api/admin/users/${id}`,
    AdminDeleteUser     : (id: string) => `/api/admin/users/${id}`,
}