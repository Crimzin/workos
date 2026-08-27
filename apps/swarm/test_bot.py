import os
import unittest
from types import SimpleNamespace


os.environ["DISCORD_BOT_TOKEN"] = "test-discord-token"
os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test-key"
os.environ.pop("ANTHROPIC_MODEL", None)

import bot as swarm_bot


class CapturingMessages:
    def __init__(self, response_content=None):
        self.requests = []
        self.response_content = response_content or [
            SimpleNamespace(type="text", text="generated plan")
        ]

    def create(self, **kwargs):
        self.requests.append(kwargs)
        return SimpleNamespace(content=self.response_content)


class SequencedMessages:
    def __init__(self, responses):
        self.requests = []
        self.responses = iter(responses)

    def create(self, **kwargs):
        self.requests.append(kwargs)
        return next(self.responses)


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

    async def test_plan_generation_returns_text_after_thinking_block(self):
        messages = CapturingMessages(
            response_content=[
                SimpleNamespace(type="thinking", thinking="reasoning", text=None),
                SimpleNamespace(type="text", text="generated plan"),
            ]
        )
        original_claude = swarm_bot.claude
        swarm_bot.claude = SimpleNamespace(messages=messages)

        try:
            result = await swarm_bot.generate_swarm_plan(
                ["[2026-08-27 12:00] [#general] Will: Ship it"],
                "TEAM ROSTER:\nWill",
            )
        finally:
            swarm_bot.claude = original_claude

        self.assertEqual(result, "generated plan")

    async def test_plan_generation_retries_when_reasoning_uses_the_output_budget(self):
        messages = SequencedMessages(
            [
                SimpleNamespace(
                    content=[
                        SimpleNamespace(
                            type="thinking",
                            thinking="reasoning",
                            text=None,
                        )
                    ],
                    stop_reason="max_tokens",
                ),
                SimpleNamespace(
                    content=[SimpleNamespace(type="text", text="generated plan")],
                    stop_reason="end_turn",
                ),
            ]
        )
        original_claude = swarm_bot.claude
        swarm_bot.claude = SimpleNamespace(messages=messages)

        try:
            result = await swarm_bot.generate_swarm_plan(
                ["[2026-08-27 12:00] [#general] Will: Ship it"],
                "TEAM ROSTER:\nWill",
            )
        finally:
            swarm_bot.claude = original_claude

        self.assertEqual(result, "generated plan")
        self.assertEqual(
            [request["max_tokens"] for request in messages.requests],
            [8192, 16384],
        )


if __name__ == "__main__":
    unittest.main()
