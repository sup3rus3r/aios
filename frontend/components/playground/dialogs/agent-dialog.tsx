"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiClient } from "@/lib/api-client"
import { usePlaygroundStore } from "@/stores/playground-store"
import type { Agent, ToolDefinition, MCPServer } from "@/types/playground"
import { Loader2, CheckCircle2, Circle, Server } from "lucide-react"

interface AgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent?: Agent | null
  onSaved?: (agent: Agent) => void
}

export function AgentDialog({ open, onOpenChange, agent, onSaved }: AgentDialogProps) {
  const providers = usePlaygroundStore((s) => s.providers)
  const agents = usePlaygroundStore((s) => s.agents)
  const setAgents = usePlaygroundStore((s) => s.setAgents)
  const setSelectedAgent = usePlaygroundStore((s) => s.setSelectedAgent)

  const isEditing = !!agent

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [providerId, setProviderId] = useState("")
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const [selectedMCPServers, setSelectedMCPServers] = useState<string[]>([])
  const [availableTools, setAvailableTools] = useState<ToolDefinition[]>([])
  const [availableMCPServers, setAvailableMCPServers] = useState<MCPServer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    // Load available tools and MCP servers from DB
    apiClient.listTools().then(setAvailableTools).catch(() => {})
    apiClient.listMCPServers().then(setAvailableMCPServers).catch(() => {})

    if (agent) {
      setName(agent.name)
      setDescription(agent.description || "")
      setSystemPrompt(agent.system_prompt || "")
      setProviderId(agent.provider_id || "")
      setSelectedTools(agent.tools || [])
      setSelectedMCPServers(agent.mcp_server_ids || [])
    } else {
      resetForm()
    }
  }, [open, agent])

  const handleSave = async () => {
    if (!name) return
    setLoading(true)
    setError("")
    try {
      if (isEditing && agent) {
        const updated = await apiClient.updateAgent(agent.id, {
          name,
          description: description || undefined,
          system_prompt: systemPrompt || undefined,
          provider_id: providerId || undefined,
          tools: selectedTools.length > 0 ? selectedTools : undefined,
          mcp_server_ids: selectedMCPServers.length > 0 ? selectedMCPServers : undefined,
        })
        setAgents(agents.map((a) => (a.id === updated.id ? updated : a)))
        onSaved?.(updated)
      } else {
        const newAgent = await apiClient.createAgent({
          name,
          description: description || undefined,
          system_prompt: systemPrompt || undefined,
          provider_id: providerId || undefined,
          tools: selectedTools.length > 0 ? selectedTools : undefined,
          mcp_server_ids: selectedMCPServers.length > 0 ? selectedMCPServers : undefined,
        })
        setAgents([...agents, newAgent])
        setSelectedAgent(newAgent.id)
        onSaved?.(newAgent)
      }
      resetForm()
      onOpenChange(false)
    } catch (err: any) {
      console.error("Failed to save agent:", err)
      setError(err?.message || "Failed to save agent")
    } finally {
      setLoading(false)
    }
  }

  const toggleTool = (toolId: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolId)
        ? prev.filter((t) => t !== toolId)
        : [...prev, toolId]
    )
  }

  const toggleMCPServer = (serverId: string) => {
    setSelectedMCPServers((prev) =>
      prev.includes(serverId)
        ? prev.filter((s) => s !== serverId)
        : [...prev, serverId]
    )
  }

  const resetForm = () => {
    setName("")
    setDescription("")
    setSystemPrompt("")
    setProviderId("")
    setSelectedTools([])
    setSelectedMCPServers([])
    setError("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-150 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Agent" : "Create Agent"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update agent configuration, model, and tools."
              : "Configure a new AI agent with a system prompt and model."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Assistant"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="agent-desc">Description</Label>
            <Input
              id="agent-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A helpful AI assistant"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="agent-provider">Model / Provider</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a provider..." />
              </SelectTrigger>
              <SelectContent>
                {providers.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No providers configured
                  </SelectItem>
                ) : (
                  providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.model_id})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {providers.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Add a provider first to connect this agent to an LLM.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="system-prompt">System Prompt</Label>
            <Textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful AI assistant..."
              rows={5}
              className="resize-none"
            />
          </div>

          {/* Tools Section */}
          <div className="grid gap-2">
            <Label>Tools</Label>
            {availableTools.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No tools available. Create tools from the playground sidebar to enable them here.
              </p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto rounded-md border border-border p-2">
                {availableTools.map((tool) => {
                  const isEnabled = selectedTools.includes(tool.id)
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => toggleTool(tool.id)}
                      className="w-full flex items-start gap-2 p-2 rounded text-xs hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="pt-0.5">
                        {isEnabled ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{tool.name}</div>
                        {tool.description && (
                          <div className="text-muted-foreground truncate">
                            {tool.description}
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* MCP Servers Section */}
          <div className="grid gap-2">
            <Label className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5" />
              MCP Servers
            </Label>
            {availableMCPServers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No MCP servers configured. Add servers from the playground sidebar.
              </p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto rounded-md border border-border p-2">
                {availableMCPServers.map((server) => {
                  const isEnabled = selectedMCPServers.includes(server.id)
                  return (
                    <button
                      key={server.id}
                      type="button"
                      onClick={() => toggleMCPServer(server.id)}
                      className="w-full flex items-start gap-2 p-2 rounded text-xs hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="pt-0.5">
                        {isEnabled ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{server.name}</div>
                        {server.description && (
                          <div className="text-muted-foreground truncate">
                            {server.description}
                          </div>
                        )}
                        <div className="text-muted-foreground/60 mt-0.5">
                          {server.transport_type}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || !name}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isEditing ? "Save Changes" : "Create Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
