import os
import json
import asyncio
import discord
from discord.ext import commands
from dotenv import load_dotenv
from anthropic import Anthropic
from datetime import datetime, timedelta, timezone
from pathlib import Path
import httpx

# Load environment variables from .env file
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

DISCORD_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

print(f"API key loaded: {'yes' if ANTHROPIC_API_KEY and ANTHROPIC_API_KEY.startswith('sk-') else 'NO'}", flush=True)

# Set up Discord bot with permissions to read messages
intents = discord.Intents.default()
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix="!swarm ", intents=intents)

# Initialize Claude client with a longer timeout for big requests
claude = Anthropic(api_key=ANTHROPIC_API_KEY, timeout=httpx.Timeout(300.0, connect=10.0))

# The Swarm system prompt
SWARM_SYSTEM_PROMPT = """You are Swarm, an operational intelligence embedded in a small team.
You've just ingested this team's recent communications across multiple channels. Your job is
to propose a clear, opinionated execution plan for the next two weeks.

Don't diagnose. Don't summarize. Don't ask what the team wants to do. Instead, tell them
what you think they should do and why — broken into week 1 and week 2, with specific
assignments per person.

Be direct. Be specific. Make tradeoffs explicit. If something is stale or being ignored,
call it out through the plan, not as commentary.

GUIDELINES:
- ONLY assign tasks to people listed in the team roster. Ignore all other server members.
- Every team member in the roster should have assignments unless their role is advisory.
- Understand each team member's role precisely. Don't assign tasks outside their skillset.
- Distinguish between things that were discussed, decided, in progress, and shipped.
- If something was already completed, don't propose it again.
- Be opinionated about sequencing and priority.

VOICE AND TONE:
- Swarm is the team's shared brain, NOT a manager or authority figure.
- Never say "I need you to..." — say "we need..." or "the team needs..."
- Swarm speaks from the team's perspective, as a sharp colleague.
- Direct and confident, but not harsh.

TAGGING:
- When referring to team members, use their Discord mention tag from the roster.
- Example: if the roster says "<@123456> (Will) - CPO", write <@123456> in your plan.
- Use the mention tag the FIRST time you reference someone in each section. After that
  you can use their display name for readability.

FORMATTING:
- Use - for bullet points (Discord renders these properly).
- Use ## for section headers.
- Use **bold** for emphasis.

OUTPUT FORMAT — you MUST use these exact section markers to separate your response.
These markers will be removed before posting — they are structural only.

===INTRO===
2-3 sentences on where the team stands and what milestone we're pushing toward. Use bold
markdown for the milestone name. Keep it tight.

===WEEK1===
Format EXACTLY like this (with real dates, real people, real tasks):

## Week 1 (Mon Date - Sun Date): Short Title

<@id> - Focus area description:
- task one
- task two
- task three

<@id> - Focus area description:
- task one
- task two

(continue for each active team member)

===WEEK2===
Same format as Week 1, then add at the end:

**Not doing:** 1-2 sentences naming what we're explicitly deferring and why.

**Target Milestone:** One clear, measurable outcome for the end of the two weeks.

===OUTRO===
Three questions to spark discussion. For each, offer a brief guess or observation to seed
the conversation — but frame it as a guess, not a conclusion. Use phrases like "I'm guessing...",
"For example...", "One risk might be...". The goal is to get the team talking, not to answer
for them.

1. **What's wrong with this plan?** What's missing? What won't work given current constraints?
2. **What are we most excited about?** What gives the team energy right now?
3. **What's the single most important thing to nail?** If we only get one thing right, what should it be?"""


def load_team_config():
    """Load team configuration from team.json."""
    config_path = Path(__file__).parent / "team.json"
    if config_path.exists():
        with open(config_path) as f:
            return json.load(f)
    return None


def build_team_context(guild):
    """Build full team context from team.json config, including project info and roster."""
    team_config = load_team_config()
    if not team_config:
        # Fallback: just list server members
        lines = ["TEAM ROSTER:"]
        for member in guild.members:
            if not member.bot:
                lines.append(f"<@{member.id}> ({member.display_name})")
        return "\n".join(lines)

    context_parts = []

    # Project context
    project = team_config.get("project", {})
    if project:
        context_parts.append("PROJECT CONTEXT:")
        context_parts.append(f"- Name: {project.get('name', 'Unknown')}")
        context_parts.append(f"- Description: {project.get('description', '')}")
        context_parts.append(f"- Stage: {project.get('stage', 'Unknown')}")
        context_parts.append(f"- Current milestone: {project.get('current_milestone', 'Not set')}")
        if project.get('next_milestone'):
            context_parts.append(f"- Next milestone after that: {project.get('next_milestone')}")
        context_parts.append(f"- Pace: {project.get('pace', 'Unknown')}")
        context_parts.append(f"- Cadence: {project.get('cadence', 'Unknown')}")
        context_parts.append("")

    # Constraints
    constraints = team_config.get("constraints", [])
    if constraints:
        context_parts.append("CONSTRAINTS (factor these into your plan):")
        for c in constraints:
            context_parts.append(f"- {c}")
        context_parts.append("")

    # Recently shipped
    shipped = team_config.get("recently_shipped", [])
    if shipped:
        context_parts.append("RECENTLY SHIPPED (do NOT re-propose these):")
        for s in shipped:
            context_parts.append(f"- {s}")
        context_parts.append("")

    # Team roster with Discord IDs
    context_parts.append("TEAM ROSTER (ONLY assign work to these people, using their mention tags):")
    for member_config in team_config["team"]:
        discord_name = member_config["discord_name"]
        matched_member = None
        for member in guild.members:
            if member.display_name == discord_name or member.name == discord_name:
                matched_member = member
                break

        hours = member_config.get("hours_per_week", "unknown")
        notes = member_config.get("notes", "")
        notes_str = f" Note: {notes}" if notes else ""

        if matched_member:
            context_parts.append(
                f"<@{matched_member.id}> ({member_config['name']}) - {member_config['role']} "
                f"[~{hours} hrs/week]{notes_str}"
            )
        else:
            context_parts.append(
                f"{member_config['name']} (discord: {discord_name}, not found in server) - "
                f"{member_config['role']} [~{hours} hrs/week]{notes_str}"
            )
            print(f"  WARNING: Could not find {discord_name} in server", flush=True)

    return "\n".join(context_parts)


async def fetch_all_channel_history(guild, days=60):
    """Fetch messages from ALL readable channels for the past N days."""
    after_date = datetime.now(timezone.utc) - timedelta(days=days)
    all_messages = []

    for channel in guild.text_channels:
        perms = channel.permissions_for(guild.me)
        if not perms.read_messages or not perms.read_message_history:
            continue

        try:
            channel_messages = []
            async for message in channel.history(limit=300, after=after_date, oldest_first=True):
                if message.author.bot:
                    continue

                timestamp = message.created_at.strftime("%Y-%m-%d %H:%M")
                content = f"[{timestamp}] [#{channel.name}] {message.author.display_name}: {message.content}"

                if message.attachments:
                    attachment_names = [a.filename for a in message.attachments]
                    content += f" [Attachments: {', '.join(attachment_names)}]"

                channel_messages.append(content)

            if channel_messages:
                all_messages.extend(channel_messages)
                print(f"  Read {len(channel_messages)} messages from #{channel.name}", flush=True)

        except Exception as e:
            print(f"  Could not read #{channel.name}: {e}", flush=True)

    # Sort all messages by timestamp
    all_messages.sort()
    return all_messages


async def generate_swarm_plan(all_messages, team_context):
    """Send the context to Claude and get back a plan."""

    user_message = f"{team_context}\n\n"
    user_message += "Here are recent messages from this team's Discord channels:\n\n"
    user_message += "\n".join(all_messages)
    user_message += "\n\nBased on everything above, propose a two-week execution plan for this team."

    # Check token size — if too big, truncate older messages
    max_chars = 150000
    if len(user_message) > max_chars:
        overflow = len(user_message) - max_chars
        trimmed_messages = "\n".join(all_messages)
        trimmed_messages = trimmed_messages[overflow:]
        next_newline = trimmed_messages.find("\n")
        if next_newline > 0:
            trimmed_messages = trimmed_messages[next_newline + 1:]
        user_message = f"{team_context}\n\n"
        user_message += "Here are recent messages from this team's Discord channels (older messages trimmed for length):\n\n"
        user_message += trimmed_messages
        user_message += "\n\nBased on everything above, propose a two-week execution plan for this team."

    # Run the blocking API call in a thread so it doesn't freeze Discord's heartbeat
    def _call_claude():
        return claude.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            system=SWARM_SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": user_message}
            ]
        )

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, _call_claude)

    return response.content[0].text


@bot.event
async def on_ready():
    """Called when the bot successfully connects to Discord."""
    print(f"Swarm is online as {bot.user}", flush=True)
    print(f"Connected to {len(bot.guilds)} server(s)", flush=True)
    for guild in bot.guilds:
        print(f"  - {guild.name}", flush=True)


@bot.command(name="plan")
async def plan(ctx, days: int = 60):
    """Generate a Swarm execution plan based on recent channel history.

    Usage: !swarm plan [days]
    Example: !swarm plan 90  (looks back 90 days)
    Default: 60 days across all readable channels.
    """
    thinking_msg = await ctx.send("🐝 Swarm is reading all channels... this may take a minute or two.")

    try:
        guild = ctx.guild

        # Build team context from config
        team_context = build_team_context(guild)
        print(f"Team context:\n{team_context}", flush=True)

        # Fetch from ALL readable channels
        print(f"Reading messages from the past {days} days across all channels...", flush=True)
        messages = await fetch_all_channel_history(guild, days=days)

        if not messages:
            await thinking_msg.edit(content="I couldn't find any recent messages to analyze. Try a longer time range: `!swarm plan 90`")
            return

        print(f"Read {len(messages)} messages. Generating plan...", flush=True)

        # Generate the plan
        plan_text = await generate_swarm_plan(messages, team_context)

        # Delete the thinking message
        await thinking_msg.delete()

        # Split into logical sections and send as separate messages
        sections = split_into_sections(plan_text)
        for section in sections:
            if len(section) <= 2000:
                await ctx.send(section)
            else:
                chunks = split_message(section, 2000)
                for chunk in chunks:
                    await ctx.send(chunk)

    except Exception as e:
        await thinking_msg.edit(content=f"Something went wrong: {str(e)}")
        print(f"Error: {e}", flush=True)
        import traceback
        traceback.print_exc()


@bot.event
async def on_message(message):
    """Debug: log every message the bot sees."""
    if message.author.bot:
        return
    print(f"[MSG] #{message.channel.name} | {message.author.display_name}: {message.content}", flush=True)
    await bot.process_commands(message)


@bot.command(name="status")
async def status(ctx):
    """Check that Swarm is alive and connected."""
    await ctx.send("🐝 Swarm is online and watching. Type `!swarm plan` to generate an execution plan.")


def split_into_sections(text):
    """Split plan text into logical sections based on markers."""
    import re as re_mod
    # Split on any of our section markers
    parts = re_mod.split(r'===(?:INTRO|WEEK1|WEEK2|OUTRO)===', text)
    # Filter out empty sections
    sections = [part.strip() for part in parts if part.strip()]

    # If parsing failed (no markers found), fall back to splitting on ## headers
    if len(sections) <= 1:
        # Try splitting on ## Week headers instead
        header_parts = re_mod.split(r'(?=^## Week)', text, flags=re_mod.MULTILINE)
        if len(header_parts) > 1:
            sections = [part.strip() for part in header_parts if part.strip()]

    # Final fallback: just return the whole text
    if len(sections) <= 1:
        return [text]

    return sections


def split_message(text, max_length=2000):
    """Split a long message into chunks that fit Discord's limit."""
    chunks = []
    while len(text) > max_length:
        split_point = text.rfind("\n", 0, max_length)
        if split_point == -1:
            split_point = max_length
        chunks.append(text[:split_point])
        text = text[split_point:].lstrip("\n")
    if text:
        chunks.append(text)
    return chunks


if __name__ == "__main__":
    if not DISCORD_TOKEN:
        print("ERROR: No Discord bot token found. Check your .env file.")
        exit(1)
    if not ANTHROPIC_API_KEY or ANTHROPIC_API_KEY == "your_anthropic_api_key_here":
        print("WARNING: No Anthropic API key set. Swarm won't be able to generate plans.")
        print("Add your key to .env: ANTHROPIC_API_KEY=your_key_here")

    print("Starting Swarm...")
    bot.run(DISCORD_TOKEN)
