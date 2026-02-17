"use client"

import { useState } from "react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  CheckCircle,
  ChevronDown,
  Loader2,
  XCircle,
  Wrench,
  Server,
  Eye,
  EyeOff,
} from "lucide-react"
import { WebPreview } from "./web-preview"

export type ToolState =
  | "pending"
  | "running"
  | "completed"
  | "error"

export type ToolProps = {
  name: string
  state: ToolState
  input?: Record<string, unknown> | string
  output?: string
  className?: string
  defaultOpen?: boolean
}

function parseInput(input: Record<string, unknown> | string | undefined): Record<string, unknown> | null {
  if (!input) return null
  if (typeof input === "string") {
    try {
      return JSON.parse(input)
    } catch {
      return null
    }
  }
  return input
}

function cleanToolName(name: string): { displayName: string; serverName?: string } {
  if (name.startsWith("mcp__")) {
    const parts = name.split("__")
    if (parts.length === 3) {
      return { displayName: parts[2], serverName: parts[1] }
    }
  }
  return { displayName: name }
}

function isPreviewable(output: string): boolean {
  const trimmed = output.trim().toLowerCase()
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html") || /^https?:\/\//i.test(trimmed)
}

const Tool = ({ name, state, input, output, className, defaultOpen = false }: ToolProps) => {
  const parsed = parseInput(input)
  const hasDetails = (parsed && Object.keys(parsed).length > 0) || output
  const { displayName, serverName } = cleanToolName(name)
  const canPreview = output && isPreviewable(output)
  const [showPreview, setShowPreview] = useState(false)

  const getStateIcon = () => {
    switch (state) {
      case "running":
      case "pending":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case "completed":
        return <CheckCircle className="h-4 w-4 text-emerald-500" />
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />
    }
  }

  const getStateBadge = () => {
    const base = "px-1.5 py-0.5 rounded-full text-[10px] font-medium"
    switch (state) {
      case "pending":
      case "running":
        return (
          <span className={cn(base, "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400")}>
            {state === "pending" ? "Pending" : "Running"}
          </span>
        )
      case "completed":
        return (
          <span className={cn(base, "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400")}>
            Completed
          </span>
        )
      case "error":
        return (
          <span className={cn(base, "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400")}>
            Error
          </span>
        )
    }
  }

  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn("overflow-hidden rounded-lg border border-border", className)}
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 bg-muted/40 px-3 py-2 text-left text-sm transition-colors",
          hasDetails ? "cursor-pointer hover:bg-muted/60" : "cursor-default"
        )}
        disabled={!hasDetails}
      >
        {getStateIcon()}
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-xs font-medium flex-1">{displayName}</span>
        {serverName && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
            <Server className="h-2.5 w-2.5" />
            {serverName}
          </span>
        )}
        {getStateBadge()}
        {hasDetails && (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        )}
      </CollapsibleTrigger>

      {hasDetails && (
        <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
          <div className="border-t border-border bg-background p-3 space-y-2">
            {parsed && Object.keys(parsed).length > 0 && (
              <div>
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Input</div>
                <div className="rounded bg-muted/30 border border-border px-2 py-1.5 font-mono text-xs space-y-0.5">
                  {Object.entries(parsed).map(([key, value]) => (
                    <div key={key}>
                      <span className="text-muted-foreground">{key}:</span>{" "}
                      <span>{typeof value === "string" ? value : JSON.stringify(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {output && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Output</div>
                  {canPreview && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowPreview(!showPreview)
                      }}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPreview ? (
                        <>
                          <EyeOff className="h-3 w-3" /> Raw
                        </>
                      ) : (
                        <>
                          <Eye className="h-3 w-3" /> Preview
                        </>
                      )}
                    </button>
                  )}
                </div>
                {showPreview && canPreview ? (
                  <WebPreview content={output} />
                ) : (
                  <div className="rounded bg-muted/30 border border-border px-2 py-1.5 font-mono text-xs max-h-40 overflow-auto whitespace-pre-wrap">
                    {output}
                  </div>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

export { Tool }
