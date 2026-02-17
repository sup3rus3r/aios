"use client"

import { useState } from "react"
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
import {
  Loader2,
  ArrowLeft,
  Plus,
  Cloud,
  Calculator,
  Search,
  Clock,
  Globe,
  Code,
} from "lucide-react"

interface ToolDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ToolTemplate {
  id: string
  name: string
  label: string
  description: string
  icon: React.ElementType
  handlerType: "http" | "python" | "builtin"
  parameters: string
  handlerConfig: string
}

const TEMPLATES: ToolTemplate[] = [
  {
    id: "weather",
    name: "get_weather",
    label: "Weather Lookup",
    description: "Get the current weather for any location",
    icon: Cloud,
    handlerType: "python",
    parameters: JSON.stringify(
      {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The city or location to get weather for",
          },
        },
        required: ["location"],
      },
      null,
      2,
    ),
    handlerConfig: JSON.stringify(
      {
        code: "def handler(params):\n    location = params.get('location', 'unknown')\n    return {'weather': f'The weather in {location} is 72°F and sunny'}",
      },
      null,
      2,
    ),
  },
  {
    id: "calculator",
    name: "calculator",
    label: "Calculator",
    description: "Evaluate mathematical expressions",
    icon: Calculator,
    handlerType: "python",
    parameters: JSON.stringify(
      {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "The math expression to evaluate (e.g. '2 + 2 * 3')",
          },
        },
        required: ["expression"],
      },
      null,
      2,
    ),
    handlerConfig: JSON.stringify(
      {
        code: "def handler(params):\n    import ast\n    expr = params.get('expression', '')\n    result = eval(compile(ast.parse(expr, mode='eval'), '<expr>', 'eval'))\n    return {'result': str(result)}",
      },
      null,
      2,
    ),
  },
  {
    id: "web_search",
    name: "web_search",
    label: "Web Search",
    description: "Search the web for information",
    icon: Search,
    handlerType: "http",
    parameters: JSON.stringify(
      {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
          limit: {
            type: "integer",
            description: "Maximum number of results",
            default: 5,
          },
        },
        required: ["query"],
      },
      null,
      2,
    ),
    handlerConfig: JSON.stringify(
      {
        url: "https://api.example.com/search",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
      null,
      2,
    ),
  },
  {
    id: "datetime",
    name: "get_datetime",
    label: "Date & Time",
    description: "Get the current date and time",
    icon: Clock,
    handlerType: "python",
    parameters: JSON.stringify(
      {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: "Timezone (e.g. 'UTC', 'US/Eastern')",
            default: "UTC",
          },
        },
        required: [],
      },
      null,
      2,
    ),
    handlerConfig: JSON.stringify(
      {
        code: "def handler(params):\n    from datetime import datetime, timezone\n    tz = params.get('timezone', 'UTC')\n    now = datetime.now(timezone.utc)\n    return {'datetime': now.isoformat(), 'timezone': tz}",
      },
      null,
      2,
    ),
  },
  {
    id: "http_request",
    name: "http_request",
    label: "API Request",
    description: "Call any external REST API endpoint",
    icon: Globe,
    handlerType: "http",
    parameters: JSON.stringify(
      {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The input to send to the API",
          },
        },
        required: ["query"],
      },
      null,
      2,
    ),
    handlerConfig: JSON.stringify(
      {
        url: "https://api.example.com/endpoint",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
      null,
      2,
    ),
  },
  {
    id: "custom_python",
    name: "custom_function",
    label: "Custom Python",
    description: "Write your own Python handler function",
    icon: Code,
    handlerType: "python",
    parameters: JSON.stringify(
      {
        type: "object",
        properties: {
          input: {
            type: "string",
            description: "The input to process",
          },
        },
        required: ["input"],
      },
      null,
      2,
    ),
    handlerConfig: JSON.stringify(
      {
        code: "def handler(params):\n    input_val = params.get('input', '')\n    # Your custom logic here\n    return {'result': f'Processed: {input_val}'}",
      },
      null,
      2,
    ),
  },
]

export function ToolDialog({ open, onOpenChange }: ToolDialogProps) {
  const [view, setView] = useState<"pick" | "form">("pick")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [handlerType, setHandlerType] = useState("python")
  const [parametersJson, setParametersJson] = useState("")
  const [handlerConfigJson, setHandlerConfigJson] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handlePickTemplate = (template: ToolTemplate) => {
    setName(template.name)
    setDescription(template.description)
    setHandlerType(template.handlerType)
    setParametersJson(template.parameters)
    setHandlerConfigJson(template.handlerConfig)
    setError("")
    setView("form")
  }

  const handleStartBlank = () => {
    setName("")
    setDescription("")
    setHandlerType("python")
    setParametersJson(
      JSON.stringify(
        {
          type: "object",
          properties: {
            input: { type: "string", description: "The input" },
          },
          required: ["input"],
        },
        null,
        2,
      ),
    )
    setHandlerConfigJson(
      JSON.stringify(
        {
          code: "def handler(params):\n    return {'result': 'hello'}",
        },
        null,
        2,
      ),
    )
    setError("")
    setView("form")
  }

  const handleHandlerTypeChange = (type: string) => {
    setHandlerType(type)
    if (type === "http") {
      setHandlerConfigJson(
        JSON.stringify(
          {
            url: "https://api.example.com/endpoint",
            method: "POST",
            headers: { "Content-Type": "application/json" },
          },
          null,
          2,
        ),
      )
    } else if (type === "python") {
      setHandlerConfigJson(
        JSON.stringify(
          {
            code: "def handler(params):\n    return {'result': 'hello'}",
          },
          null,
          2,
        ),
      )
    }
  }

  const handleCreate = async () => {
    if (!name) return
    setError("")

    let parameters: Record<string, unknown>
    let handlerConfig: Record<string, unknown> | undefined

    try {
      parameters = JSON.parse(parametersJson)
    } catch {
      setError("Invalid JSON in parameters schema")
      return
    }

    try {
      handlerConfig = handlerConfigJson.trim()
        ? JSON.parse(handlerConfigJson)
        : undefined
    } catch {
      setError("Invalid JSON in handler config")
      return
    }

    setLoading(true)
    try {
      await apiClient.createTool({
        name,
        description: description || undefined,
        parameters,
        handler_type: handlerType,
        handler_config: handlerConfig,
      })
      window.dispatchEvent(new CustomEvent("tool-created"))
      resetAndClose()
    } catch (err: any) {
      console.error("Failed to create tool:", err)
      setError(err?.message || "Failed to create tool")
    } finally {
      setLoading(false)
    }
  }

  const resetAndClose = () => {
    setName("")
    setDescription("")
    setHandlerType("python")
    setParametersJson("")
    setHandlerConfigJson("")
    setError("")
    setView("pick")
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setView("pick")
          setError("")
        }
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-2xl overflow-hidden">
        {view === "pick" ? (
          <>
            <DialogHeader>
              <DialogTitle>Create a Tool</DialogTitle>
              <DialogDescription>
                Pick a template to get started or create one from scratch.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-2 py-2 max-h-[60vh] overflow-y-auto pr-1">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handlePickTemplate(t)}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card text-left transition-colors hover:bg-accent hover:border-accent-foreground/20"
                >
                  <div className="mt-0.5 rounded-md bg-muted p-1.5">
                    <t.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {t.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={handleStartBlank}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Blank Tool
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 shrink-0"
                  onClick={() => setView("pick")}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Button>
                <div>
                  <DialogTitle>Configure Tool</DialogTitle>
                  <DialogDescription>
                    Customize the tool name, parameters, and handler.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="tool-name">Name</Label>
                  <Input
                    id="tool-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="my_tool"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tool-handler-type">Handler Type</Label>
                  <Select
                    value={handlerType}
                    onValueChange={handleHandlerTypeChange}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="python">Python (code)</SelectItem>
                      <SelectItem value="http">HTTP (API call)</SelectItem>
                      <SelectItem value="builtin">Built-in</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="tool-desc">Description</Label>
                <Input
                  id="tool-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this tool does — the agent reads this"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="tool-params">
                  Parameters{" "}
                  <span className="text-muted-foreground font-normal">
                    (JSON Schema)
                  </span>
                </Label>
                <Textarea
                  id="tool-params"
                  value={parametersJson}
                  onChange={(e) => setParametersJson(e.target.value)}
                  rows={7}
                  className="font-mono text-xs resize-none"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="tool-config">
                  Handler Config{" "}
                  <span className="text-muted-foreground font-normal">
                    (
                    {handlerType === "http"
                      ? "url, method, headers"
                      : handlerType === "python"
                        ? "code"
                        : "config"}
                    )
                  </span>
                </Label>
                <Textarea
                  id="tool-config"
                  value={handlerConfigJson}
                  onChange={(e) => setHandlerConfigJson(e.target.value)}
                  rows={7}
                  className="font-mono text-xs resize-none"
                />
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={loading || !name}>
                {loading ? (
                  <Loader2 className="h-5 w-4 animate-spin mr-2" />
                ) : null}
                Create Tool
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
