# VIS OpenClaw User Guide

Welcome to VIS OpenClaw! This guide will help you get started quickly.

## Table of Contents

1. [System Overview](#system-overview)
2. [Quick Start](#quick-start)
3. [Feature Guide](#feature-guide)
4. [FAQ](#faq)

---

## System Overview

VIS OpenClaw is a visualization platform for monitoring and managing OpenClaw multi-Agent systems.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Agent** | AI assistant that executes specific tasks |
| **Session** | Conversation with an Agent |
| **Task** | Work assigned to Agents |
| **Gateway** | OpenClaw gateway service |

### System Architecture

```
User → VIS OpenClaw UI → OpenClaw Gateway → Agent
```

---

## Quick Start

### Starting the System

1. Double-click `start.bat` (Windows) or run `npm run dev` (Linux/macOS)
2. Wait for services to start
3. Open browser at http://localhost:3000

![Dashboard](./usershouce/jiancemianban.png)

### Navigation

The left sidebar contains:

| Menu | Function |
|------|----------|
| 📊 Dashboard | View system status and tasks |
| 👤 Agents | Manage AI assistants |
| 💬 Sessions | View and intervene conversations |
| 📄 Commands | OpenClaw CLI command reference |

---

## Feature Guide

### 1. Dashboard

The dashboard is the main interface showing overall system status.

![Dashboard](./usershouce/jiancemianban.png)

#### Status Indicators

| Indicator | Description |
|-----------|-------------|
| Agent Count | Total configured Agents |
| Session Count | Active sessions |
| Task Count | Created tasks |
| Distributed Tasks | Tasks sent to Agents |

#### Task Management

**Create Task**

1. Click "Create Task" button
2. Fill in task name and description
3. Use `@agentName` in description to mention Agents
4. Click Create

**Distribute Task**

1. Find the task card to distribute
2. Click "Distribute" button
3. System sends task to related Agents

**Scheduled Tasks**

1. Click "Schedule" button on task card
2. Set schedule mode:
   - **Interval**: Run every N minutes/hours
   - **Fixed Time**: Run at specific time daily
3. Save configuration

#### Task Status

| Status | Description |
|--------|-------------|
| Pending | Task created, waiting for distribution |
| Distributed | Task sent to Agent |
| Failed | Task distribution failed |
| Scheduled | Task has schedule configured |

---

### 2. Agent Management

Manage OpenClaw AI assistants.

![Agent Management](./usershouce/agentguanli.png)

#### Agent List

Shows all Agents with their status:

| Info | Description |
|------|-------------|
| Avatar/Emoji | Agent identifier |
| Name | Agent name |
| Model | AI model in use |
| Status | Online/Offline |

#### Create Agent

![Create Agent](./usershouce/agentchuangjian.png)

1. Click "Create Agent"
2. Fill in basic information
3. Select AI model
4. Edit configuration files
5. Save

#### Edit Configuration Files

Each Agent has 8 configuration files:

| File | Purpose |
|------|---------|
| IDENTITY.md | Identity definition |
| SOUL.md | Core values |
| USER.md | User/team information |
| AGENTS.md | Workflow |
| MEMORY.md | Long-term memory |
| TOOLS.md | Tool configuration |
| HEARTBEAT.md | Periodic checks |
| BOOTSTRAP.md | First-time setup |

#### Agent Communication Configuration

![Communication Config](./usershouce/agenttongxin.png)

Configure communication permissions between Agents:

1. Select Agent to configure
2. Choose allowed Agents in "Communication Config"
3. Save configuration

---

### 3. Session Management

View and manage all sessions.

![Session Management](./usershouce/huihuaguanli.png)

#### Session List

Left panel shows all sessions:

| Info | Description |
|------|-------------|
| Agent Name | Owner Agent |
| Type | Main session/Subagent |
| Session ID | Unique identifier |
| Message Count | Number of messages |

#### Message Area

Right panel shows selected session's message history:

- User messages (blue)
- AI responses (green)

#### Send Message

1. Select a session
2. Type message in bottom input box
3. Press Ctrl+Enter or click "Send"

---

### 4. Commands Reference

OpenClaw CLI command reference manual.

![Commands](./usershouce/mingling.png)

Browse all commands by category, with one-click copy support.

---

## FAQ

### Q: How to stop services?

Run `stop.bat` (Windows) or press Ctrl+C in terminal.

### Q: Gateway shows disconnected?

1. Confirm OpenClaw is installed
2. Click "Start Gateway" button
3. Check Gateway service status

### Q: Agent shows offline?

1. Check Agent configuration
2. Confirm Gateway service is running
3. Try restarting Gateway

### Q: Task distribution failed?

1. Confirm target Agent is online
2. Check Agent communication config
3. Verify Agent configuration file format

### Q: Message send failed?

1. Confirm session is active
2. Check backend service status
3. Check browser console for errors

---

*Last Updated: 2026-04-01*