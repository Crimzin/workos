# BrainShare MVP Requirements

## Problem Statement
Teams using individual LLMs for work lose valuable context across conversations. Insights, decisions, and knowledge stay siloed in personal AI chats instead of being shared with teammates.

## Solution Hypothesis
BrainShare's intelligent analysis of LLM conversations, combined with seamless context sharing across team members' existing LLM workflows, will dramatically improve team collaboration and decision quality.

## MVP Scope
Build and validate LLM integration layer that adds shared context capabilities to existing LLM workflows. Focus on seamless integration, not standalone interface.

## Core User Flow

### Setup
1. Team leader connects Google Drive to BrainShare service
2. BrainShare generates integration configs for the team
3. Team members add BrainShare integration to their preferred LLMs:
   - **MCP-Enabled LLMs** (Claude Code, Gemini): Single MCP server configuration
   - **ChatGPT**: Custom GPT with pre-configured API actions (leverages Plus subscription)
   - **Other LLMs**: System prompt + API instructions
4. LLM automatically includes relevant team context in all responses

### Automatic Context Extraction
- **Primary Trigger**: BrainShare detects valuable context signals ("decided", "learned", "concluded", "agreed", "discovered")
- **Backup Trigger**: Session-based analysis every 15-20 message exchanges
- **Action**: BrainShare's AI analyzes conversation chunk and extracts valuable insights
- **Result**: High-quality context automatically added to shared doc

### Manual Context Push
- **Trigger**: Natural language like "add this to BrainShare", "make sure BrainShare gets this"
- **Action**: LLM recognizes user intent and pushes specific content to shared doc
- **Result**: User maintains control over what gets shared

### Pull Context
- **Trigger**: Natural language like "what does the team think about X?", "check BrainShare for our decision on Y", "what's our latest thinking on Z?"
- **Action**: LLM recognizes query intent and searches shared doc for relevant information
- **Result**: User gets team's collective knowledge on the topic

### Auto Context
- **Behavior**: LLM automatically considers BrainShare context when responding
- **Scope**: All queries benefit from shared team knowledge
- **Transparency**: LLM indicates when using BrainShare context

## Technical Requirements

### 1. Shared Context Store
- **Format**: Structured markdown file with compression metadata
- **Sections**: Decisions, Active Work, Team Knowledge, Open Questions
- **Access**: Google Drive via BrainShare OAuth service
- **Versioning**: Track changes and compression history

### 2. LLM Integration Layer
- **MCP-First Strategy**: Single MCP server for Claude Code, Gemini, and other MCP-enabled LLMs
- **Platform-Specific Configs**: Custom GPT actions for ChatGPT, system prompts for others
- **Dual Function Interface**:
  - `brainshare_analyze`: Send conversation chunks for automatic context extraction
  - `brainshare_push`: Manual user-controlled context addition
  - `brainshare_pull`: Query shared context
- **Auto-inclusion**: System prompt that always references relevant context
- **Context Window Optimization**: Delivers appropriate detail level per LLM capacity
- **Universal Function Interface**: Same function signatures across all LLM platforms

### 3. Intelligent Context Engine (Core IP)
- **Conversation Analysis**: BrainShare's AI identifies valuable context from LLM conversations
- **Trigger Detection**: Recognizes context signals (decisions, insights, conclusions, learnings)
- **Automatic Categorization**: Assigns context to appropriate categories with confidence scores
- **Adaptive Compression**: Different strategies based on content type
  - **Lossy**: Discussions → key decisions, debates → final consensus
  - **Lossless**: Code snippets, exact quotes, technical specs, commitments
  - **Hybrid**: Preserve decisions + compress rationale
- **Context Window Adaptation**: Analyzes LLM type, query relevance, content priority, and compression level to deliver right-sized context payload
- **Quality Control**: High confidence threshold for auto-extraction, user override capability

### 4. Context Management
- **Deduplication**: Prevent redundant information across compressed content
- **Freshness**: Timestamp all updates with compression metadata
- **Fidelity Preservation**: Maintain critical information in original form when needed
- **Context Bounds**: Maintain document size within usable limits through intelligent compression

## Success Metrics
- **Automatic Extraction Quality**: BrainShare correctly identifies valuable context (>90% accuracy)
- **User Trust**: Team members rely on auto-extracted context without manual review
- **Adoption**: All team members' LLMs actively analyze conversations with BrainShare
- **Context Utility**: Shared context leads to better decisions and reduced duplicate work
- **User Control**: Manual push functionality used when auto-extraction misses something

## Implementation Approach

### Phase 1: Manual Setup (Week 1)
- Create shared markdown file structure
- Write custom prompts for push/pull operations
- Test with 2 team members using different LLMs

### Phase 2: Refinement (Week 2)
- Improve context extraction and formatting
- Add basic categorization and timestamps
- Validate workflow with real project work

### Phase 3: Evaluation (Week 3)
- Measure actual usage and value
- Gather feedback on friction points
- Decide on next iteration features

## Acceptance Criteria
- [ ] Shared context file is automatically updated via LLM commands
- [ ] Team members can query shared context through their LLMs
- [ ] LLMs automatically include relevant context in responses
- [ ] Context updates are properly formatted and categorized
- [ ] System works across different LLM platforms
- [ ] Team reports improved collaboration after 2 weeks of use

## Non-Requirements (Future Versions)
- Advanced search and filtering
- Integration with external tools (Slack, Notion, etc.)
- User authentication or permissions
- Mobile app

## Core Value Proposition
- **The IP**: BrainShare's intelligence layer that knows what context is worth preserving and sharing
- **User Principle**: Bias toward user control - automatic intelligence with manual override capability

## Secondary Features (Not Core MVP)
- **BrainShare Web GUI**: Basic interface for direct context editing and team management
- **Optional Chat Interface**: Web-based chat for teams without LLM preferences
- **Context Analytics**: Usage patterns and collaboration insights

## Technical Constraints
- Must work with existing LLM interfaces
- No custom software installation for end users
- Platform and LLM agnostic
- Simple enough to debug and modify quickly

## Token Cost Model (MVP)
- **MCP-Enabled LLMs** (Claude Code, Gemini): Users provide their own API keys
- **ChatGPT**: Custom GPTs leverage users' existing Plus subscriptions (no additional API costs)
- **Other LLMs**: Users provide respective API keys
- **Future**: Hybrid model with BrainShare-funded free tier for trials

## Risk Mitigation
- **Context quality**: Start with manual review of auto-generated updates
- **Adoption**: Make push/pull commands extremely simple
- **Technical debt**: Keep implementation minimal and hackable
- **Scope creep**: Resist adding features until core flow is validated