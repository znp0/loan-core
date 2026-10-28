"""Failure-path checks for disposable process cleanup; no database required."""

import io
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock, patch

import preflight


class PreflightCleanupTests(unittest.TestCase):
    def test_database_stops_when_service_fails_to_start(self):
        child = Mock()
        child.poll.return_value = 42
        child.returncode = 42
        commands = []

        def execute(args, **kwargs):
            commands.append(args)
            return "17.7"

        with patch.object(preflight, "command", side_effect=execute), patch.object(preflight.os, "geteuid", return_value=1000), patch.object(preflight.subprocess, "Popen", return_value=child):
            with self.assertRaisesRegex(RuntimeError, "exit cleanly"):
                preflight.exercise_service(Path("/tmp/source"), Path("/tmp/pg"), {})

        self.assertEqual(commands[-1][-4:], ["-m", "fast", "-w", "stop"])

    def test_success_records_health_and_clean_shutdown(self):
        child = Mock()
        child.poll.return_value = None
        child.returncode = 0
        response = io.BytesIO(b'{"status":"ok","service":"identity-service"}')
        response.status = 200
        report = {}

        with patch.object(preflight, "command", return_value="17.7"), patch.object(preflight.os, "geteuid", return_value=1000), patch.object(preflight.subprocess, "Popen", return_value=child), patch.object(preflight, "urlopen", return_value=response):
            preflight.exercise_service(Path("/tmp/source"), Path("/tmp/pg"), report)

        self.assertEqual(report["health"]["service"], "identity-service")
        self.assertEqual(report["service_shutdown"], "clean")
        self.assertEqual(report["database_shutdown"], "clean")
        child.send_signal.assert_called_once()

    def test_forced_kill_is_a_failure(self):
        child = Mock()
        child.poll.return_value = None
        child.wait.side_effect = [subprocess.TimeoutExpired("node", 10), 0]

        with self.assertRaisesRegex(RuntimeError, "SIGKILL"):
            preflight.stop_service(child)

        child.kill.assert_called_once()


if __name__ == "__main__":
    unittest.main()
