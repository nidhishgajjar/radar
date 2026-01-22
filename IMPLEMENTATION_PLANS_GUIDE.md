# Complete Implementation Plans Analysis

## Overview
This document maps all implementation plans across your system and explains how they're linked to projects.

## 1. Claude Code's Native Plan Storage

### Location
`~/.claude/plans/`

### Status
**Currently Empty** - Claude Code's native plan mode doesn't persist plans to this directory in the current version (2.1.7).

### How Plans Are Actually Stored
Instead of a dedicated plans directory, Claude's conversation history (which includes plans) is stored in:
- `~/.claude/projects/-Users-nidhishgajjar-conversations-{project}/{session-uuid}.jsonl`

## 2. Project-to-Session Mapping

### How Projects Are Linked
Claude Code creates project-specific directories by encoding the full path:
- **Project Path**: `/Users/nidhishgajjar/conversations/healthcarejobs`
- **Encoded Directory**: `~/.claude/projects/-Users-nidhishgajjar-conversations-healthcarejobs/`

### Directory Structure
```
~/.claude/projects/-Users-nidhishgajjar-conversations-healthcarejobs/
├── {session-uuid}.jsonl              # Conversation history (includes plans)
├── {session-uuid}/
│   ├── subagents/
│   │   └── agent-{id}.jsonl         # Task agent execution logs
│   └── tool-results/
│       └── toolu_{id}.txt           # Large tool outputs
```

### Active Projects with Sessions
- **/Users/nidhishgajjar/conversations/baileys-whatsapp**
  - Sessions: 24
  - Storage: `~/.claude/projects/-Users-nidhishgajjar-conversations-baileys-whatsapp/`
- **/Users/nidhishgajjar/conversations/healthcarejobs**
  - Sessions: 4
  - Storage: `~/.claude/projects/-Users-nidhishgajjar-conversations-healthcarejobs/`
- **/Users/nidhishgajjar/conversations/spoq-cli**
  - Sessions: 23
  - Storage: `~/.claude/projects/-Users-nidhishgajjar-conversations-spoq-cli/`
- **/Users/nidhishgajjar/conversations/spoq-web-apis**
  - Sessions: 17
  - Storage: `~/.claude/projects/-Users-nidhishgajjar-conversations-spoq-web-apis/`

## 3. Project-Specific Plan Documents

These are explicit plan/spec documents created within project repositories:

### healthcarejobs
**Location**: `/Users/nidhishgajjar/conversations/healthcarejobs/docs/plans/`
- `2026-01-22-feat-exa-people-search-webapp-plan.md`

### baileys-whatsapp
**Location**: `/Users/nidhishgajjar/conversations/baileys-whatsapp/docs/`
- `SYSTEM_IMPLEMENTATION_PLAN.md`
- `SYSTEM_DESIGN_OVERVIEW.md`

### spoq-cli
**Location**: `/Users/nidhishgajjar/conversations/spoq-cli/docs/`
- `future-plans/00-overview.md` - Platform architecture overview
- `future-plans/01-cloud-product.md` - Cloud VPS product plan
- `future-plans/02-jetson-product.md` - Jetson hardware plan
- `future-plans/03-networking.md` - Network infrastructure
- `future-plans/04-multi-user.md` - Multi-user support
- `future-plans/05-setup-flows.md` - Setup workflows
- `future-plans/06-migration.md` - Migration strategy
- `future-plans/07-notifications.md` - Notification system
- `INTEGRATION_PLAN.md` - Integration documentation

### spoq-web-apis
**Location**: `/Users/nidhishgajjar/conversations/spoq-web-apis/docs/`
- `conductor-spec.md` - Conductor specification
- `architecture.md` - System architecture
- `device-expansion.md` - Device expansion design
- `device-expansion-implementation.md` - Implementation details
- `hostinger-integration.md` - Hostinger VPS integration
- `FRONTEND_API_REFERENCE.md` - API reference

## 4. Plugin Plans (Starry Night - Nova/Pulsar)

### Nova Plans
**What**: Nova (/nova) creates structured implementation plans with phases
**Storage**: NOT found in dedicated files - stored in session conversation history
**Execution**: Pulsar (/pulsar) executes Nova plans

### Pulsar Execution State
**What**: Pulsar tracks plan execution progress
**Storage**: Likely in session JSONL files or temporary state
**Commands**:
- `/pulsar-status` - View execution status
- `/pulse` - View live status overview

**Plugin Location**: `~/.claude/plugins/marketplaces/awlsen-plugins/starry-night/`

## 5. How to Identify Which Project a Plan Belongs To

### Method 1: From Session JSONL Files
Each session file contains a `cwd` field indicating the project:
```json
{"cwd":"/Users/nidhishgajjar/conversations/healthcarejobs",...}
```

### Method 2: From Directory Name
The project directory name is encoded in the path:
- `~/.claude/projects/-Users-nidhishgajjar-conversations-healthcarejobs/`
  → Project: `/Users/nidhishgajjar/conversations/healthcarejobs`

### Method 3: From Explicit Plan Files
Plans in `docs/plans/` directories are explicitly part of that project repository.

## 6. Plan Types Summary

| Type | Location | Link Method | Example |
|------|----------|-------------|---------|
| **Claude Native** | Session JSONL | `cwd` field in session | healthcarejobs session |
| **Nova/Pulsar** | Session JSONL | `cwd` field in session | Starry-night workflows |
| **Explicit Docs** | `{project}/docs/plans/` | File path | `2026-01-22-feat-exa-people-search-webapp-plan.md` |
| **Spec Docs** | `{project}/docs/` | File path | `conductor-spec.md` |
| **Future Plans** | `{project}/docs/future-plans/` | File path | spoq-cli roadmap |

## 7. Key Findings

1. **No Dedicated Plan Storage**: Claude Code doesn't persist plans to `~/.claude/plans/` - they're embedded in session conversation history

2. **Project Linking**: Projects are linked via:
   - Directory name encoding (path → encoded string)
   - `cwd` field in session JSONL files
   - Explicit file locations for doc-based plans

3. **Multiple Plan Systems**:
   - Claude's native plan mode (in conversations)
   - Starry Night Nova/Pulsar (structured phases)
   - Manual plan documents (markdown in docs/)

4. **Session Persistence**: All conversational plans are in `{uuid}.jsonl` files with full conversation context

5. **Subagent Tracking**: When Task agents are spawned, their logs are in `{uuid}/subagents/agent-{id}.jsonl`

## 8. Recommendations

### To Find All Plans for a Project:
1. Check `~/.claude/projects/-Users-nidhishgajjar-conversations-{project}/`
2. Look for session JSONL files and search for plan-related content
3. Check `{project}/docs/plans/` for explicit plan documents
4. Check `{project}/docs/` for spec and implementation documents

### To Access Historical Plans:
Use the session JSONL files - they contain complete conversation history including all planning discussions.

### To Create Persistent Plans:
Create markdown files in `{project}/docs/plans/` following the pattern:
```
YYYY-MM-DD-{type}-{feature-name}-plan.md
```

## Quick Reference Commands

### Find all plans for current project
```bash
# List session files
ls -la ~/.claude/projects/-Users-nidhishgajjar-conversations-$(basename $(pwd))/

# Find explicit plan docs
find ./docs -name "*plan*.md" -o -name "*spec*.md"
```

### Search session history for plans
```bash
# Search for plan-related content in sessions
grep -r "Phase\|Implementation\|Acceptance Criteria" ~/.claude/projects/-Users-nidhishgajjar-conversations-$(basename $(pwd))/ | head -20
```

### List all projects with sessions
```bash
ls -d ~/.claude/projects/*conversations*
```
