import plistlib
import unittest
from pathlib import Path


DEPLOY_DIR = Path("/Users/williamcorbett/Library/Application Support/WorkOS/Swarm")
PLIST_PATH = Path(__file__).parent / "launchd" / "com.willcorbett.workos.swarm.plist"


class SwarmLaunchAgentTests(unittest.TestCase):
    def test_launch_agent_keeps_the_main_swarm_bot_running(self):
        self.assertTrue(PLIST_PATH.exists(), "launch agent plist is missing")

        with PLIST_PATH.open("rb") as plist_file:
            config = plistlib.load(plist_file)

        self.assertEqual(config["Label"], "com.willcorbett.workos.swarm")
        self.assertEqual(
            config["ProgramArguments"],
            [str(DEPLOY_DIR / ".venv/bin/python"), str(DEPLOY_DIR / "bot.py")],
        )
        self.assertEqual(config["WorkingDirectory"], str(DEPLOY_DIR))
        self.assertIs(config["RunAtLoad"], True)
        self.assertIs(config["KeepAlive"], True)


if __name__ == "__main__":
    unittest.main()
