import json
import asyncio
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch


os.environ["DISCORD_BOT_TOKEN"] = "test-discord-token"
os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test-key"

import bot as swarm_bot


CURRENT_CONFIG = {
    "project": {
        "name": "BURN",
        "description": "Social fitness game",
        "stage": "private beta",
        "current_milestone": "Twenty testers",
    },
    "team": [
        {
            "name": "Will",
            "discord_name": "crimzin",
            "role": "Product and operations",
            "hours_per_week": 5,
            "notes": "Primary QA tester",
        }
    ],
    "constraints": ["Part-time team"],
    "recently_shipped": ["Private beta"],
}


class ContextHypothesisTests(unittest.TestCase):
    def test_parses_summary_and_valid_team_config(self):
        self.assertTrue(
            hasattr(swarm_bot, "parse_context_hypothesis"),
            "parse_context_hypothesis is missing",
        )
        response = (
            "===SUMMARY===\n"
            "The milestone moved to public launch.\n"
            "===CONFIG===\n"
            f"```json\n{json.dumps(CURRENT_CONFIG)}\n```"
        )

        summary, config = swarm_bot.parse_context_hypothesis(response)

        self.assertEqual(summary, "The milestone moved to public launch.")
        self.assertEqual(config, CURRENT_CONFIG)

    def test_rejects_hypothesis_that_drops_required_config_structure(self):
        response = (
            "===SUMMARY===\nIncomplete config.\n"
            "===CONFIG===\n"
            '{"project": {}, "team": []}'
        )

        with self.assertRaisesRegex(ValueError, "constraints"):
            swarm_bot.parse_context_hypothesis(response)

    def test_accepts_any_positive_lookback_and_rejects_nonpositive_values(self):
        self.assertTrue(
            hasattr(swarm_bot, "validate_lookback_days"),
            "validate_lookback_days is missing",
        )
        self.assertEqual(swarm_bot.validate_lookback_days(1), 1)
        self.assertEqual(swarm_bot.validate_lookback_days(30), 30)
        self.assertEqual(swarm_bot.validate_lookback_days(9876), 9876)
        with self.assertRaisesRegex(ValueError, "positive"):
            swarm_bot.validate_lookback_days(0)
        with self.assertRaisesRegex(ValueError, "positive"):
            swarm_bot.validate_lookback_days(-10)


class ContextReplyTests(unittest.TestCase):
    def test_only_a_reply_to_the_latest_hypothesis_targets_the_session(self):
        self.assertTrue(
            hasattr(swarm_bot, "ContextSession"),
            "ContextSession is missing",
        )
        self.assertTrue(
            hasattr(swarm_bot, "reply_targets_context_session"),
            "reply_targets_context_session is missing",
        )
        session = swarm_bot.ContextSession(
            channel_id=7,
            days=30,
            base_config=CURRENT_CONFIG,
            draft_config=CURRENT_CONFIG,
            latest_message_id=42,
        )

        latest_reply = SimpleNamespace(
            channel=SimpleNamespace(id=7),
            reference=SimpleNamespace(message_id=42),
        )
        old_reply = SimpleNamespace(
            channel=SimpleNamespace(id=7),
            reference=SimpleNamespace(message_id=41),
        )
        unrelated = SimpleNamespace(channel=SimpleNamespace(id=7), reference=None)

        self.assertTrue(
            swarm_bot.reply_targets_context_session(latest_reply, session)
        )
        self.assertFalse(swarm_bot.reply_targets_context_session(old_reply, session))
        self.assertFalse(swarm_bot.reply_targets_context_session(unrelated, session))

    def test_classifies_commit_cancel_and_corrections(self):
        self.assertTrue(
            hasattr(swarm_bot, "classify_context_reply"),
            "classify_context_reply is missing",
        )
        self.assertEqual(swarm_bot.classify_context_reply(" commit "), "commit")
        self.assertEqual(swarm_bot.classify_context_reply("CANCEL"), "cancel")
        self.assertEqual(
            swarm_bot.classify_context_reply("Railway is already live"),
            "correction",
        )


class ContextCommitTests(unittest.TestCase):
    def test_commit_replaces_config_and_records_backup_and_author(self):
        self.assertTrue(
            hasattr(swarm_bot, "commit_team_config"),
            "commit_team_config is missing",
        )
        updated = json.loads(json.dumps(CURRENT_CONFIG))
        updated["project"]["stage"] = "public beta"
        committed_at = datetime(2026, 8, 27, 22, 0, tzinfo=timezone.utc)

        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "team.json"
            config_path.write_text(
                json.dumps(CURRENT_CONFIG, indent=2) + "\n", encoding="utf-8"
            )

            result = swarm_bot.commit_team_config(
                updated,
                committed_by="crimzin",
                config_path=config_path,
                committed_at=committed_at,
            )

            self.assertEqual(
                json.loads(config_path.read_text(encoding="utf-8")), updated
            )
            self.assertEqual(
                json.loads(result["backup_path"].read_text(encoding="utf-8")),
                CURRENT_CONFIG,
            )
            audit_entries = [
                json.loads(line)
                for line in result["audit_path"].read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual(audit_entries[0]["committed_by"], "crimzin")
            self.assertEqual(audit_entries[0]["committed_at"], committed_at.isoformat())


class ContextCommandTests(unittest.TestCase):
    def test_context_command_supports_mentions_and_defaults_to_thirty_days(self):
        context_command = swarm_bot.bot.get_command("context")
        self.assertIsNotNone(context_command)
        self.assertEqual(context_command.clean_params["days"].default, 30)

        dummy_bot = SimpleNamespace(user=SimpleNamespace(id=1234))
        prefixes = swarm_bot.bot.command_prefix(dummy_bot, SimpleNamespace())
        self.assertIn("<@1234> ", prefixes)
        self.assertIn("<@!1234> ", prefixes)
        self.assertIn("!swarm ", prefixes)


class CapturingContextMessages:
    def __init__(self, config):
        self.requests = []
        response_text = (
            "===SUMMARY===\nUpdated project context.\n"
            "===CONFIG===\n"
            f"{json.dumps(config)}"
        )
        self.response_content = [
            SimpleNamespace(type="thinking", thinking="reasoning", text=None),
            SimpleNamespace(type="text", text=response_text),
        ]

    def create(self, **kwargs):
        self.requests.append(kwargs)
        return SimpleNamespace(content=self.response_content)


class ContextGenerationTests(unittest.IsolatedAsyncioTestCase):
    async def test_generates_initial_hypothesis_from_discord_messages(self):
        self.assertTrue(
            hasattr(swarm_bot, "generate_context_hypothesis"),
            "generate_context_hypothesis is missing",
        )
        updated = json.loads(json.dumps(CURRENT_CONFIG))
        updated["project"]["stage"] = "public beta"
        messages = CapturingContextMessages(updated)
        original_claude = swarm_bot.claude
        swarm_bot.claude = SimpleNamespace(messages=messages)

        try:
            summary, config = await swarm_bot.generate_context_hypothesis(
                CURRENT_CONFIG,
                ["[2026-08-27 12:00] [#general] Will: Public beta is live"],
            )
        finally:
            swarm_bot.claude = original_claude

        self.assertEqual(summary, "Updated project context.")
        self.assertEqual(config, updated)
        self.assertEqual(messages.requests[0]["model"], "claude-sonnet-5")

    async def test_revision_sends_the_latest_draft_and_human_correction(self):
        self.assertTrue(
            hasattr(swarm_bot, "revise_context_hypothesis"),
            "revise_context_hypothesis is missing",
        )
        corrected = json.loads(json.dumps(CURRENT_CONFIG))
        corrected["project"]["current_milestone"] = "App Store launch"
        messages = CapturingContextMessages(corrected)
        original_claude = swarm_bot.claude
        swarm_bot.claude = SimpleNamespace(messages=messages)

        try:
            summary, config = await swarm_bot.revise_context_hypothesis(
                CURRENT_CONFIG,
                "Public TestFlight is complete; the milestone is App Store launch.",
            )
        finally:
            swarm_bot.claude = original_claude

        self.assertEqual(summary, "Updated project context.")
        self.assertEqual(config, corrected)
        request_text = messages.requests[0]["messages"][0]["content"]
        self.assertIn("Public TestFlight is complete", request_text)
        self.assertIn('"current_milestone": "Twenty testers"', request_text)


class FakeSentMessage:
    def __init__(self, message_id, content):
        self.id = message_id
        self.content = content
        self.deleted = False

    async def delete(self):
        self.deleted = True

    async def edit(self, content):
        self.content = content


class FakeChannel:
    def __init__(self, channel_id=7):
        self.id = channel_id
        self.sent = []
        self.next_message_id = 100

    async def send(self, content):
        message = FakeSentMessage(self.next_message_id, content)
        self.next_message_id += 1
        self.sent.append(message)
        return message


class FakeContext:
    def __init__(self, channel):
        self.channel = channel
        self.guild = SimpleNamespace(id=99)

    async def send(self, content):
        return await self.channel.send(content)


class FakeReplyMessage:
    def __init__(self, channel, content, reply_to, author="teammate"):
        self.channel = channel
        self.content = content
        self.reference = SimpleNamespace(message_id=reply_to)
        self.author = SimpleNamespace(display_name=author, id=555)

    async def reply(self, content):
        return await self.channel.send(content)


class ContextConversationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.assertTrue(
            hasattr(swarm_bot, "context_sessions_by_channel"),
            "context_sessions_by_channel is missing",
        )
        swarm_bot.context_sessions_by_channel.clear()

    async def test_context_command_creates_reviewable_session_for_requested_days(self):
        channel = FakeChannel()
        ctx = FakeContext(channel)
        updated = json.loads(json.dumps(CURRENT_CONFIG))
        updated["project"]["stage"] = "public beta"
        history_mock = AsyncMock(return_value=["Discord evidence"])

        with patch.object(
            swarm_bot, "load_team_config", return_value=CURRENT_CONFIG
        ), patch.object(
            swarm_bot,
            "fetch_all_channel_history",
            new=history_mock,
        ), patch.object(
            swarm_bot,
            "generate_context_hypothesis",
            new=AsyncMock(return_value=("Public beta is live.", updated)),
        ):
            await swarm_bot.context.callback(ctx, days=365)

        session = swarm_bot.context_sessions_by_channel[channel.id]
        self.assertEqual(session.days, 365)
        self.assertEqual(session.draft_config, updated)
        self.assertEqual(session.latest_message_id, channel.sent[-1].id)
        self.assertIn("Reply to this message", channel.sent[-1].content)
        self.assertIn("`commit`", channel.sent[-1].content)
        history_mock.assert_awaited_once_with(
            ctx.guild,
            days=365,
            message_limit=None,
        )

    async def test_correction_revises_draft_without_committing(self):
        channel = FakeChannel()
        session = swarm_bot.ContextSession(
            channel_id=channel.id,
            days=30,
            base_config=CURRENT_CONFIG,
            draft_config=CURRENT_CONFIG,
            latest_message_id=42,
        )
        swarm_bot.context_sessions_by_channel[channel.id] = session
        corrected = json.loads(json.dumps(CURRENT_CONFIG))
        corrected["project"]["current_milestone"] = "App Store launch"
        message = FakeReplyMessage(
            channel,
            "The milestone is App Store launch",
            reply_to=42,
        )

        commit_mock = Mock()
        with patch.object(
            swarm_bot,
            "revise_context_hypothesis",
            new=AsyncMock(return_value=("Milestone corrected.", corrected)),
        ), patch.object(swarm_bot, "commit_team_config", commit_mock):
            handled = await swarm_bot.handle_context_session_reply(message, session)

        self.assertTrue(handled)
        self.assertEqual(session.draft_config, corrected)
        self.assertNotEqual(session.latest_message_id, 42)
        commit_mock.assert_not_called()

    async def test_commit_writes_latest_draft_and_closes_session(self):
        channel = FakeChannel()
        session = swarm_bot.ContextSession(
            channel_id=channel.id,
            days=30,
            base_config=CURRENT_CONFIG,
            draft_config=CURRENT_CONFIG,
            latest_message_id=42,
        )
        swarm_bot.context_sessions_by_channel[channel.id] = session
        message = FakeReplyMessage(channel, "commit", reply_to=42)
        commit_mock = Mock(
            return_value={
                "backup_path": Path("team-config-history/backup.json"),
                "audit_path": Path("team-config-history/commits.jsonl"),
            }
        )

        with patch.object(swarm_bot, "commit_team_config", commit_mock):
            handled = await swarm_bot.handle_context_session_reply(message, session)

        self.assertTrue(handled)
        commit_mock.assert_called_once_with(
            CURRENT_CONFIG,
            committed_by="teammate (555)",
        )
        self.assertNotIn(channel.id, swarm_bot.context_sessions_by_channel)
        self.assertIn("committed", channel.sent[-1].content.lower())

    async def test_cancel_closes_session_without_writing(self):
        channel = FakeChannel()
        session = swarm_bot.ContextSession(
            channel_id=channel.id,
            days=30,
            base_config=CURRENT_CONFIG,
            draft_config=CURRENT_CONFIG,
            latest_message_id=42,
        )
        swarm_bot.context_sessions_by_channel[channel.id] = session
        message = FakeReplyMessage(channel, "cancel", reply_to=42)
        commit_mock = Mock()

        with patch.object(swarm_bot, "commit_team_config", commit_mock):
            handled = await swarm_bot.handle_context_session_reply(message, session)

        self.assertTrue(handled)
        commit_mock.assert_not_called()
        self.assertNotIn(channel.id, swarm_bot.context_sessions_by_channel)
        self.assertIn("cancelled", channel.sent[-1].content.lower())

    async def test_concurrent_replies_only_revise_the_latest_hypothesis_once(self):
        channel = FakeChannel()
        session = swarm_bot.ContextSession(
            channel_id=channel.id,
            days=30,
            base_config=CURRENT_CONFIG,
            draft_config=CURRENT_CONFIG,
            latest_message_id=42,
        )
        swarm_bot.context_sessions_by_channel[channel.id] = session
        first_reply = FakeReplyMessage(channel, "First correction", reply_to=42)
        second_reply = FakeReplyMessage(channel, "Second correction", reply_to=42)
        revise_mock = AsyncMock(
            return_value=("Revised once.", CURRENT_CONFIG)
        )

        with patch.object(
            swarm_bot,
            "revise_context_hypothesis",
            new=revise_mock,
        ):
            results = await asyncio.gather(
                swarm_bot.handle_context_session_reply(first_reply, session),
                swarm_bot.handle_context_session_reply(second_reply, session),
            )

        self.assertEqual(revise_mock.await_count, 1)
        self.assertEqual(results.count(True), 1)
        self.assertEqual(results.count(False), 1)


if __name__ == "__main__":
    unittest.main()
