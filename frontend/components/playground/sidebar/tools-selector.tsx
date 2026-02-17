"use client"

import { useEffect, useState } from "react"
import { usePlaygroundStore } from "@/stores/playground-store"
import { apiClient } from "@/lib/api-client"
import type { ToolDefinition } from "@/types/playground"
import { Wrench, CheckCircle2, Circle, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SidebarSection } from "./sidebar-section"
import { useConfirm } from "@/hooks/use-confirm"

interface ToolsSelectorProps {
  onCreateTool?: () => void
  hideCreate?: boolean
}

export function ToolsSelector({ onCreateTool, hideCreate }: ToolsSelectorProps) {
  const mode = usePlaygroundStore((s) => s.mode)
  const agents = usePlaygroundStore((s) => s.agents)
  const teams = usePlaygroundStore((s) => s.teams)
  const setAgents = usePlaygroundStore((s) => s.setAgents)
  const selectedAgentId = usePlaygroundStore((s) => s.selectedAgentId)
  const selectedTeamId = usePlaygroundStore((s) => s.selectedTeamId)

  const [availableTools, setAvailableTools] = useState<ToolDefinition[]>([])
  const [saving, setSaving] = useState(false)
  const [ConfirmDialog, confirmDelete] = useConfirm({
    title: "Delete tool",
    description: "This will permanently delete this tool. This action cannot be undone.",
    confirmLabel: "Delete",
    variant: "destructive",
  })

  const selectedAgent =
    mode === "agent" && selectedAgentId
      ? agents.find((a) => a.id === selectedAgentId)
      : null

  const selectedTeam =
    mode === "team" && selectedTeamId
      ? teams.find((t) => t.id === selectedTeamId)
      : null

  const agentTools = selectedAgent?.tools || []

  useEffect(() => {
    apiClient.listTools().then(setAvailableTools).catch(() => {})
  }, [])

  // Listen for tool-created events to refresh the list
  useEffect(() => {
    const handler = () => {
      apiClient.listTools().then(setAvailableTools).catch(() => {})
    }
    window.addEventListener("tool-created", handler)
    return () => window.removeEventListener("tool-created", handler)
  }, [])

  const toggleTool = async (toolId: string) => {
    if (!selectedAgent || saving) return
    setSaving(true)
    const newTools = agentTools.includes(toolId)
      ? agentTools.filter((t) => t !== toolId)
      : [...agentTools, toolId]
    try {
      const updated = await apiClient.updateAgent(selectedAgent.id, { tools: newTools })
      setAgents(agents.map((a) => (a.id === updated.id ? updated : a)))
    } catch (err) {
      console.error("Failed to update agent tools:", err)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTool = async (e: React.MouseEvent, toolId: string) => {
    e.stopPropagation()
    const ok = await confirmDelete()
    if (!ok) return
    try {
      await apiClient.deleteTool(toolId)
      setAvailableTools((prev) => prev.filter((t) => t.id !== toolId))
    } catch (err) {
      console.error("Failed to delete tool:", err)
    }
  }

  const activeCount = availableTools.filter((t) => agentTools.includes(t.id)).length

  return (
    <>
    <SidebarSection
      icon={<Wrench className="h-4 w-4 text-muted-foreground" />}
      title="Tools"
      badge={
        activeCount > 0 ? (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 min-w-4 flex items-center justify-center">
            {activeCount}
          </Badge>
        ) : undefined
      }
      action={
        !hideCreate ? (
          <Button variant="ghost" size="icon-sm" className="h-6 w-6 cursor-pointer" onClick={onCreateTool}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        ) : undefined
      }
    >
      {!selectedAgent && !selectedTeam ? (
        <p className="text-xs text-muted-foreground">
          Select an {mode} to configure tools
        </p>
      ) : mode === "team" && selectedTeam ? (
        <p className="text-xs text-muted-foreground">
          Configure tools on individual agents
        </p>
      ) : selectedAgent ? (
        <div className="space-y-2">
          {availableTools.length === 0 ? (
            <div className="text-center py-3">
              <p className="text-xs text-muted-foreground mb-2">
                No tools created yet
              </p>
              {!hideCreate && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full cursor-pointer text-xs"
                  onClick={onCreateTool}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Create Tool
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {availableTools.map((tool) => {
                const isEnabled = agentTools.includes(tool.id)
                return (
                  <div
                    key={tool.id}
                    onClick={() => toggleTool(tool.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") toggleTool(tool.id) }}
                    className={`flex items-start gap-3 p-1.5 py-3 rounded text-xs cursor-pointer transition-colors group ${
                      saving ? "opacity-50 pointer-events-none" : "hover:bg-sidebar-accent/30"
                    }`}
                  >
                    <div className="pt-0.5 ">
                      {isEnabled ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{tool.name}</div>
                      {tool.description && (
                        <div className="text-muted-foreground truncate">
                          {tool.description}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => handleDeleteTool(e, tool.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity pt-0.5"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive transition-colors" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : null}
    </SidebarSection>
    <ConfirmDialog />
    </>
  )
}
