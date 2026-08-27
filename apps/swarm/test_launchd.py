import plistlib
import unittest
from pathlib import Path


SWARM_DIR = Path("/Users/williamcorbett/Desktop/Claude-Projects/WorkOS/apps/swarm")
PLIST_PATH = Path(__file__).parent / "launchd" / "com.willcorbett.workos.swarm.plist"


class SwarmLaunchAgentTests(unittest.TestCase):
    def test_launch_agent_keeps_the_main_swarm_bot_running(self):
        self.assertTrue(PLIST_PATH.exists(), "launch agent plist is missing")

        with PLIST_PATH.open("rb") as plist_file:
            config = plistlib.load(plist_file)

        self.assertEqual(config["Label"], "com.willcorbett.workos.swarm")
        self.assertEqual(
            config["ProgramArguments"],
            [str(SWARM_DIR / ".venv/bin/python"), str(SWARM_DIR / "bot.py")],
        )
        self.assertEqual(config["WorkingDirectory"], str(SWARM_DIR))
        self.assertIs(config["RunAtLoad"], True)
        self.assertIs(config["KeepAlive"], True)


if __name__ == "__main__":
    unittest.main()
