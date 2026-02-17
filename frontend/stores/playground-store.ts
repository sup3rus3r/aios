import { create } from "zustand"
import { apiClient } from "@/lib/api-client"
import type { LLMProvider, Agent, Team, Session, Message, ToolCall, AgentStep, ToolRound, MCPServer } from "@/types/playground"

interface PlaygroundState {
  // Sidebar
  sidebarOpen: boolean
  mode: "agent" | "team"

  // Selected entities
  selectedProviderId: string | null
  selectedAgentId: string | null
  selectedTeamId: string | null
  selectedSessionId: string | null

  // Data
  providers: LLMProvider[]
  agents: Agent[]
  teams: Team[]
  sessions: Session[]
  messages: Message[]

  mcpServers: MCPServer[]

  // Loading states
  isLoadingProviders: boolean
  isLoadingAgents: boolean
  isLoadingTeams: boolean
  isLoadingSessions: boolean
  isLoadingMessages: boolean

  // Streaming
  isStreaming: boolean
  streamingContent: string
  streamingReasoning: string
  streamingToolCalls: ToolCall[]
  streamingAgentStep: AgentStep | null
  streamingToolRound: ToolRound | null
  abortController: AbortController | null

  // Actions
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setMode: (mode: "agent" | "team") => void
  setSelectedProvider: (id: string | null) => void
  setSelectedAgent: (id: string | null) => void
  setSelectedTeam: (id: string | null) => void
  setSelectedSession: (id: string | null) => void
  setProviders: (providers: LLMProvider[]) => void
  setAgents: (agents: Agent[]) => void
  setTeams: (teams: Team[]) => void
  setMCPServers: (mcpServers: MCPServer[]) => void
  setSessions: (sessions: Session[]) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateLastMessage: (updates: Partial<Message>) => void
  setIsStreaming: (streaming: boolean) => void
  setStreamingContent: (content: string) => void
  appendStreamingContent: (chunk: string) => void
  setStreamingReasoning: (reasoning: string) => void
  appendStreamingReasoning: (chunk: string) => void
  setStreamingToolCalls: (toolCalls: ToolCall[]) => void
  upsertStreamingToolCall: (toolCall: ToolCall) => void
  setStreamingAgentStep: (step: AgentStep | null) => void
  setStreamingToolRound: (round: ToolRound | null) => void
  setAbortController: (controller: AbortController | null) => void
  clearChat: () => void
  reset: () => void

  // Async actions
  fetchProviders: () => Promise<void>
  fetchAgents: () => Promise<void>
  fetchTeams: () => Promise<void>
  fetchSessions: () => Promise<void>
  fetchSessionMessages: (sessionId: string) => Promise<void>
  createSession: (entityType: "agent" | "team", entityId: string, title?: string) => Promise<Session | null>
  deleteSession: (sessionId: string) => Promise<void>
  deleteAgent: (agentId: string) => Promise<void>
  deleteTeam: (teamId: string) => Promise<void>
  deleteProvider: (providerId: string) => Promise<void>
  fetchMCPServers: () => Promise<void>
  deleteMCPServer: (serverId: string) => Promise<void>
}

export const usePlaygroundStore = create<PlaygroundState>((set, get) => ({
  // Initial state
  sidebarOpen: true,
  mode: "agent",
  selectedProviderId: null,
  selectedAgentId: null,
  selectedTeamId: null,
  selectedSessionId: null,
  providers: [],
  agents: [],
  teams: [],
  sessions: [],
  mcpServers: [],
  messages: [],
  isLoadingProviders: false,
  isLoadingAgents: false,
  isLoadingTeams: false,
  isLoadingSessions: false,
  isLoadingMessages: false,
  isStreaming: false,
  streamingContent: "",
  streamingReasoning: "",
  streamingToolCalls: [],
  streamingAgentStep: null,
  streamingToolRound: null,
  abortController: null,

  // Actions
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setMode: (mode) => set({ mode, selectedSessionId: null, messages: [] }),
  setSelectedProvider: (id) => set({ selectedProviderId: id }),
  setSelectedAgent: (id) => set({ selectedAgentId: id, selectedSessionId: null, messages: [] }),
  setSelectedTeam: (id) => set({ selectedTeamId: id, selectedSessionId: null, messages: [] }),
  setSelectedSession: (id) => set({ selectedSessionId: id }),
  setProviders: (providers) => set({ providers }),
  setAgents: (agents) => set({ agents }),
  setTeams: (teams) => set({ teams }),
  setMCPServers: (mcpServers) => set({ mcpServers }),
  setSessions: (sessions) => set({ sessions }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  updateLastMessage: (updates) =>
    set((s) => {
      const msgs = [...s.messages]
      if (msgs.length > 0) {
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], ...updates }
      }
      return { messages: msgs }
    }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setStreamingContent: (content) => set({ streamingContent: content }),
  appendStreamingContent: (chunk) =>
    set((s) => ({ streamingContent: s.streamingContent + chunk })),
  setStreamingReasoning: (reasoning) => set({ streamingReasoning: reasoning }),
  appendStreamingReasoning: (chunk) =>
    set((s) => ({ streamingReasoning: s.streamingReasoning + chunk })),
  setStreamingToolCalls: (toolCalls) => set({ streamingToolCalls: toolCalls }),
  upsertStreamingToolCall: (toolCall) =>
    set((s) => {
      const existing = s.streamingToolCalls.findIndex((tc) => tc.id === toolCall.id)
      if (existing >= 0) {
        const updated = [...s.streamingToolCalls]
        updated[existing] = toolCall
        return { streamingToolCalls: updated }
      }
      return { streamingToolCalls: [...s.streamingToolCalls, toolCall] }
    }),
  setStreamingAgentStep: (step) => set({ streamingAgentStep: step }),
  setStreamingToolRound: (round) => set({ streamingToolRound: round }),
  setAbortController: (controller) => set({ abortController: controller }),
  clearChat: () => set({ messages: [], selectedSessionId: null, streamingContent: "", streamingReasoning: "", streamingToolCalls: [], streamingAgentStep: null, streamingToolRound: null }),
  reset: () =>
    set({
      sidebarOpen: true,
      mode: "agent",
      selectedProviderId: null,
      selectedAgentId: null,
      selectedTeamId: null,
      selectedSessionId: null,
      providers: [],
      agents: [],
      teams: [],
      sessions: [],
      mcpServers: [],
      messages: [],
      isLoadingProviders: false,
      isLoadingAgents: false,
      isLoadingTeams: false,
      isLoadingSessions: false,
      isLoadingMessages: false,
      isStreaming: false,
      streamingContent: "",
      streamingReasoning: "",
      streamingToolCalls: [],
      streamingAgentStep: null,
      streamingToolRound: null,
      abortController: null,
    }),

  // Async actions
  fetchProviders: async () => {
    set({ isLoadingProviders: true })
    try {
      const providers = await apiClient.listProviders()
      set({ providers, isLoadingProviders: false })
    } catch (error) {
      console.error("Failed to fetch providers:", error)
      set({ isLoadingProviders: false })
    }
  },

  fetchAgents: async () => {
    set({ isLoadingAgents: true })
    try {
      const agents = await apiClient.listAgents()
      set({ agents, isLoadingAgents: false })
    } catch (error) {
      console.error("Failed to fetch agents:", error)
      set({ isLoadingAgents: false })
    }
  },

  fetchTeams: async () => {
    set({ isLoadingTeams: true })
    try {
      const teams = await apiClient.listTeams()
      set({ teams, isLoadingTeams: false })
    } catch (error) {
      console.error("Failed to fetch teams:", error)
      set({ isLoadingTeams: false })
    }
  },

  fetchSessions: async () => {
    set({ isLoadingSessions: true })
    try {
      const sessions = await apiClient.listSessions()
      set({ sessions, isLoadingSessions: false })
    } catch (error) {
      console.error("Failed to fetch sessions:", error)
      set({ isLoadingSessions: false })
    }
  },

  fetchSessionMessages: async (sessionId: string) => {
    set({ isLoadingMessages: true })
    try {
      const messages = await apiClient.getSessionMessages(sessionId)
      set({ messages, isLoadingMessages: false })
    } catch (error) {
      console.error("Failed to fetch session messages:", error)
      set({ isLoadingMessages: false })
    }
  },

  createSession: async (entityType: "agent" | "team", entityId: string, title?: string) => {
    try {
      const session = await apiClient.createSession({ entity_type: entityType, entity_id: entityId, title })
      const state = get()
      set({ sessions: [...state.sessions, session], selectedSessionId: session.id })
      return session
    } catch (error) {
      console.error("Failed to create session:", error)
      return null
    }
  },

  deleteSession: async (sessionId: string) => {
    try {
      await apiClient.deleteSession(sessionId)
      const state = get()
      set({ sessions: state.sessions.filter((s) => s.id !== sessionId) })
      if (state.selectedSessionId === sessionId) {
        set({ selectedSessionId: null, messages: [] })
      }
    } catch (error) {
      console.error("Failed to delete session:", error)
    }
  },

  deleteAgent: async (agentId: string) => {
    try {
      await apiClient.deleteAgent(agentId)
      const state = get()
      set({ agents: state.agents.filter((a) => a.id !== agentId) })
      if (state.selectedAgentId === agentId) {
        set({ selectedAgentId: null, selectedSessionId: null, messages: [] })
      }
    } catch (error) {
      console.error("Failed to delete agent:", error)
      throw error
    }
  },

  deleteTeam: async (teamId: string) => {
    try {
      await apiClient.deleteTeam(teamId)
      const state = get()
      set({ teams: state.teams.filter((t) => t.id !== teamId) })
      if (state.selectedTeamId === teamId) {
        set({ selectedTeamId: null, selectedSessionId: null, messages: [] })
      }
    } catch (error) {
      console.error("Failed to delete team:", error)
      throw error
    }
  },

  deleteProvider: async (providerId: string) => {
    try {
      await apiClient.deleteProvider(providerId)
      const state = get()
      set({ providers: state.providers.filter((p) => p.id !== providerId) })
      if (state.selectedProviderId === providerId) {
        set({ selectedProviderId: null })
      }
    } catch (error) {
      console.error("Failed to delete provider:", error)
      throw error
    }
  },

  fetchMCPServers: async () => {
    try {
      const mcpServers = await apiClient.listMCPServers()
      set({ mcpServers })
    } catch (error) {
      console.error("Failed to fetch MCP servers:", error)
    }
  },

  deleteMCPServer: async (serverId: string) => {
    try {
      await apiClient.deleteMCPServer(serverId)
      const state = get()
      set({ mcpServers: state.mcpServers.filter((s) => s.id !== serverId) })
    } catch (error) {
      console.error("Failed to delete MCP server:", error)
      throw error
    }
  },
}))
