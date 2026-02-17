"use client"

import { useMemo } from "react"
import { PromptSuggestion } from "@/components/ai-elements/prompt-suggestion"
import { Bot, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Agent, Team } from "@/types/playground"

interface ChatSuggestionsProps {
  agent?: Agent
  team?: Team
  teamAgents?: Agent[]
  mode: "agent" | "team"
  onSelect: (prompt: string) => void
}

interface Suggestion {
  label: string
  prompt: string
}

const TOOL_SUGGESTIONS: Record<string, Suggestion[]> = {
  web_search: [
    { label: "Search the web", prompt: "Search the web for the latest news on AI agents" },
    { label: "Research a topic", prompt: "Research and summarize the current state of" },
  ],
  file_read: [
    { label: "Read a file", prompt: "Read and summarize the contents of" },
  ],
  file_write: [
    { label: "Create a file", prompt: "Create a new file with" },
  ],
  code_interpreter: [
    { label: "Run some code", prompt: "Write and run a Python script that" },
    { label: "Analyze data", prompt: "Analyze this data and show me the results:" },
  ],
  sql_query: [
    { label: "Query the database", prompt: "Show me the schema of the database and list all tables" },
  ],
  api_call: [
    { label: "Call an API", prompt: "Make an API request to" },
  ],
  image_generation: [
    { label: "Generate an image", prompt: "Generate an image of" },
  ],
  calculator: [
    { label: "Calculate something", prompt: "Calculate" },
  ],
  email: [
    { label: "Draft an email", prompt: "Draft a professional email about" },
  ],
  slack: [
    { label: "Send a Slack message", prompt: "Draft a Slack message to the team about" },
  ],
}

const KEYWORD_SUGGESTIONS: { keywords: string[]; suggestions: Suggestion[] }[] = [
  {
    keywords: ["code", "coding", "developer", "programming", "engineer", "software"],
    suggestions: [
      { label: "Review code", prompt: "Review this code for bugs and improvements:" },
      { label: "Explain a concept", prompt: "Explain how async/await works with practical examples" },
      { label: "Debug an issue", prompt: "Help me debug this error:" },
    ],
  },
  {
    keywords: ["write", "writing", "content", "copywriter", "blog", "article"],
    suggestions: [
      { label: "Write a draft", prompt: "Write a first draft about" },
      { label: "Improve my text", prompt: "Improve the clarity and tone of this text:" },
      { label: "Create an outline", prompt: "Create a detailed outline for an article about" },
    ],
  },
  {
    keywords: ["data", "analyst", "analytics", "metrics", "dashboard"],
    suggestions: [
      { label: "Analyze trends", prompt: "Analyze the key trends in this data and highlight insights:" },
      { label: "Create a report", prompt: "Create a summary report of" },
      { label: "Explain metrics", prompt: "What metrics should I track for" },
    ],
  },
  {
    keywords: ["customer", "support", "help", "service", "ticket"],
    suggestions: [
      { label: "Draft a response", prompt: "Draft a helpful response to this customer inquiry:" },
      { label: "Troubleshoot", prompt: "Help me troubleshoot this issue a customer is reporting:" },
      { label: "Create a FAQ", prompt: "Create FAQ entries for common questions about" },
    ],
  },
  {
    keywords: ["research", "academic", "paper", "study", "literature"],
    suggestions: [
      { label: "Summarize findings", prompt: "Summarize the key findings from this research:" },
      { label: "Compare approaches", prompt: "Compare and contrast these approaches:" },
      { label: "Literature review", prompt: "What are the most important papers and developments in" },
    ],
  },
  {
    keywords: ["plan", "project", "manage", "strategy", "roadmap"],
    suggestions: [
      { label: "Create a plan", prompt: "Create an action plan for" },
      { label: "Break down a task", prompt: "Break this project into smaller tasks with priorities:" },
      { label: "Risk assessment", prompt: "What are the main risks and mitigations for" },
    ],
  },
  {
    keywords: ["translate", "language", "localization", "i18n"],
    suggestions: [
      { label: "Translate text", prompt: "Translate the following text to" },
      { label: "Review translation", prompt: "Review this translation for accuracy and naturalness:" },
    ],
  },
  {
    keywords: ["sql", "database", "query", "postgres", "mysql", "sqlite"],
    suggestions: [
      { label: "Write a query", prompt: "Write a SQL query to" },
      { label: "Optimize a query", prompt: "Optimize this SQL query for performance:" },
      { label: "Design a schema", prompt: "Design a database schema for" },
    ],
  },
]

const TEAM_MODE_SUGGESTIONS: Record<string, Suggestion[]> = {
  coordinate: [
    { label: "Coordinate a task", prompt: "Coordinate the team to work on" },
    { label: "Assign subtasks", prompt: "Break this task into subtasks and assign to the right agents:" },
  ],
  route: [
    { label: "Route a question", prompt: "Which agent should handle this:" },
    { label: "Get expert help", prompt: "I need help with" },
  ],
  collaborate: [
    { label: "Start collaboration", prompt: "Have the team collaborate on" },
    { label: "Get multiple perspectives", prompt: "Get each agent's perspective on" },
  ],
}

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { label: "What can you do?", prompt: "What can you do?" },
  { label: "Help me get started", prompt: "What's the best way to get started with you? Walk me through your capabilities." },
  { label: "Summarize something", prompt: "Summarize the following:" },
  { label: "Brainstorm ideas", prompt: "Brainstorm creative ideas for" },
]

function buildSuggestions(
  agent?: Agent,
  team?: Team,
  teamAgents?: Agent[],
  mode?: "agent" | "team"
): Suggestion[] {
  const suggestions: Suggestion[] = []
  const seen = new Set<string>()

  const add = (s: Suggestion) => {
    if (!seen.has(s.prompt)) {
      seen.add(s.prompt)
      suggestions.push(s)
    }
  }

  if (mode === "team" && team) {
    // Team-mode specific suggestions
    const modeSuggestions = TEAM_MODE_SUGGESTIONS[team.mode]
    if (modeSuggestions) {
      modeSuggestions.forEach(add)
    }

    // If team has agents with tools, gather tool suggestions
    if (teamAgents) {
      const allTools = new Set(teamAgents.flatMap((a) => a.tools || []))
      for (const tool of allTools) {
        const toolKey = Object.keys(TOOL_SUGGESTIONS).find(
          (k) => tool.toLowerCase().includes(k) || k.includes(tool.toLowerCase())
        )
        if (toolKey) {
          TOOL_SUGGESTIONS[toolKey].forEach(add)
        }
      }

      // Agent-name based suggestions for teams
      if (teamAgents.length > 1) {
        add({
          label: "Compare agent outputs",
          prompt: `Ask each agent (${teamAgents.map((a) => a.name).join(", ")}) to give their take on`,
        })
      }
    }
  }

  if (mode === "agent" && agent) {
    // Tool-based suggestions
    if (agent.tools && agent.tools.length > 0) {
      for (const tool of agent.tools) {
        const toolKey = Object.keys(TOOL_SUGGESTIONS).find(
          (k) => tool.toLowerCase().includes(k) || k.includes(tool.toLowerCase())
        )
        if (toolKey) {
          TOOL_SUGGESTIONS[toolKey].forEach(add)
        }
      }
    }

    // Keyword matching from name, description, and system prompt
    const searchText = [
      agent.name,
      agent.description,
      agent.system_prompt,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()

    for (const entry of KEYWORD_SUGGESTIONS) {
      if (entry.keywords.some((kw) => searchText.includes(kw))) {
        entry.suggestions.forEach(add)
      }
    }

    // MCP server hints
    if (agent.mcp_server_ids && agent.mcp_server_ids.length > 0) {
      add({
        label: "List available tools",
        prompt: "List all the tools and integrations you have access to, with a brief description of each",
      })
    }
  }

  // Always add some defaults if we don't have enough
  if (suggestions.length < 2) {
    DEFAULT_SUGGESTIONS.forEach(add)
  }

  // Cap at 4 suggestions
  return suggestions.slice(0, 4)
}

export function ChatSuggestions({
  agent,
  team,
  teamAgents,
  mode,
  onSelect,
}: ChatSuggestionsProps) {
  const name = mode === "agent" ? agent?.name : team?.name
  const description = mode === "agent" ? agent?.description : team?.description

  const suggestions = useMemo(
    () => buildSuggestions(agent, team, teamAgents, mode),
    [agent, team, teamAgents, mode]
  )

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
      {/* Header */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-muted">
          <Bot className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="text-center space-y-1.5">
          <h2 className="text-lg font-semibold">
            {name || "Start a conversation"}
          </h2>
          {description && (
            <p className="text-sm text-muted-foreground max-w-md">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Team members */}
      {mode === "team" && teamAgents && teamAgents.length > 0 && (
        <div className="flex flex-col items-center gap-2 max-w-md">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>{teamAgents.length} agent{teamAgents.length !== 1 ? "s" : ""} &middot; {team?.mode}</span>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {teamAgents.map((a) => (
              <Badge key={a.id} variant="outline" className="text-[11px]">
                {a.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Contextual suggestions */}
      <div className="flex flex-wrap justify-center gap-2 max-w-lg">
        {suggestions.map((s) => (
          <PromptSuggestion
            key={s.prompt}
            onClick={() => onSelect(s.prompt)}
            className="text-xs h-auto py-2 px-4"
          >
            {s.label}
          </PromptSuggestion>
        ))}
      </div>
    </div>
  )
}
