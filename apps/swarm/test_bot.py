import os
import unittest
from types import SimpleNamespace


os.environ["DISCORD_BOT_TOKEN"] = "test-discord-token"
os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test-key"
os.environ.pop("ANTHROPIC_MODEL", None)

import bot as swarm_bot


class CapturingMessages:
    def __init__(self):
        self.requests = []

    def create(self, **kwargs):
        self.requests.append(kwargs)
        return SimpleNamespace(content=[SimpleNamespace(text="generated plan")])


class SwarmModelTests(unittest.IsolatedAsyncioTestCase):
    async def test_plan_generation_uses_configured_model(self):
        messages = CapturingMessages()
        original_claude = swarm_bot.claude
        original_model = getattr(swarm_bot, "ANTHROPIC_MODEL", None)
        swarm_bot.claude = SimpleNamespace(messages=messages)
        swarm_bot.ANTHROPIC_MODEL = "claude-sonnet-5"

        try:
            result = await swarm_bot.generate_swarm_plan(
                ["[2026-08-27 12:00] [#general] Will: Ship it"],
                "TEAM ROSTER:\nWill",
            )
        finally:
            swarm_bot.claude = original_claude
            if original_model is None:
                del swarm_bot.ANTHROPIC_MODEL
            else:
                swarm_bot.ANTHROPIC_MODEL = original_model

        self.assertEqual(result, "generated plan")
        self.assertEqual(messages.requests[0]["model"], "claude-sonnet-5")


if __name__ == "__main__":
    unittest.main()
