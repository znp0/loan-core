"""Exercise a disposable PostgreSQL cluster and a compiled service without Docker."""

import argparse
import json
import os
from pathlib import Path
import platform
import pwd
import shutil
import signal
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen


def command(args, **kwargs):
    result = subprocess.run(args, check=True, capture_output=True, text=True, **kwargs)
    return result.stdout.strip()


def read_optional(path):
    target = Path(path)
    if target.is_file():
        return target.read_text().strip()
    return None


def available_port():
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        return server.getsockname()[1]


def stop_service(child):
    if child.poll() is None:
        child.send_signal(signal.SIGTERM)
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=5)
            raise RuntimeError("Service required SIGKILL") from None
    if child.returncode not in (0, -signal.SIGTERM):
        raise RuntimeError("Service did not exit cleanly")


def exercise_service(root, pg_bin, report):
    # Run outside the checkout so bootstrap cannot load a developer's .env file.
    with tempfile.TemporaryDirectory(prefix="loan-core-preflight-") as temporary:
        working = Path(temporary)
        working.chmod(0o755)
        cluster = working / "postgres"
        cluster.mkdir(mode=0o700)
        prefix = []
        if os.geteuid() == 0:
            account = pwd.getpwnam("postgres")
            os.chown(cluster, account.pw_uid, account.pw_gid)
            prefix = ["runuser", "-u", "postgres", "--"]

        pg_port = available_port()
        pg_ctl = prefix + [str(pg_bin / "pg_ctl"), "-D", str(cluster)]
        command(prefix + [str(pg_bin / "initdb"), "-D", str(cluster), "-U", "preflight", "--auth=trust", "--no-locale"])
        database_started = False
        service = None
        try:
            # Trust authentication is limited to this short-lived loopback-only cluster.
            command(pg_ctl + ["-l", str(cluster / "server.log"), "-o", f"-h 127.0.0.1 -p {pg_port} -k {cluster}", "-w", "start"])
            database_started = True
            connection = ["-h", "127.0.0.1", "-p", str(pg_port), "-U", "preflight"]
            command([str(pg_bin / "createdb")] + connection + ["preflight_test"])
            version = command([str(pg_bin / "psql")] + connection + ["-d", "preflight_test", "-Atc", "SHOW server_version"])
            report["postgres_server_version"] = version
            if version.split(".")[0] != "17":
                raise RuntimeError("The database server must be PostgreSQL 17")

            service_port = available_port()
            environment = {
                "PATH": os.environ["PATH"],
                "NODE_ENV": "test",
                "HOST": "127.0.0.1",
                "PORT": str(service_port),
                "DATABASE_URL": f"postgresql://preflight@127.0.0.1:{pg_port}/preflight_test",
                "JWT_SECRET": os.urandom(32).hex(),
            }
            with (working / "service.log").open("w") as logs:
                service = subprocess.Popen([shutil.which("node"), str(root / "apps/identity-service/dist/main.js")], cwd=working, env=environment, stdout=logs, stderr=logs)
                deadline = time.monotonic() + 30
                while time.monotonic() < deadline:
                    if service.poll() is not None:
                        raise RuntimeError("Identity service exited before becoming healthy")
                    try:
                        with urlopen(f"http://127.0.0.1:{service_port}/api/v1/health", timeout=1) as response:
                            body = json.load(response)
                            if response.status != 200 or body != {"status": "ok", "service": "identity-service"}:
                                raise RuntimeError("Unexpected health response")
                            report["health"] = body
                            break
                    except OSError:
                        time.sleep(0.1)
                else:
                    raise RuntimeError("Timed out waiting for identity service health")
        finally:
            try:
                if service is not None:
                    stop_service(service)
                    report["service_shutdown"] = "clean"
            finally:
                if database_started:
                    command(pg_ctl + ["-m", "fast", "-w", "stop"])
                    report["database_shutdown"] = "clean"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pg-bin", type=Path, default=Path("/usr/lib/postgresql/17/bin"))
    parser.add_argument("--quota-note", required=True, help="CPU quota/session allowance observed in the Kaggle UI; no account credentials")
    parser.add_argument("--local", action="store_true", help="Diagnostic only: never establishes Kaggle feasibility")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    args.output.mkdir(parents=True, exist_ok=False)
    report = {
        "status": "failed",
        "platform": "local" if args.local else "kaggle",
        "kaggle_feasibility_verified": False,
        "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source_revision": command(["git", "rev-parse", "HEAD"], cwd=root),
        "source_dirty": bool(command(["git", "status", "--porcelain"], cwd=root)),
        "python": platform.python_version(),
        "machine": platform.machine(),
        "kernel": platform.release(),
        "cpu_count": os.cpu_count(),
        "cpu_affinity": sorted(os.sched_getaffinity(0)),
        "cpu_info": read_optional("/proc/cpuinfo"),
        "memory_info": read_optional("/proc/meminfo"),
        "cpu_max": read_optional("/sys/fs/cgroup/cpu.max"),
        "memory_max": read_optional("/sys/fs/cgroup/memory.max"),
        "os_release": read_optional("/etc/os-release"),
        "disk_free_bytes": shutil.disk_usage(args.output).free,
        "quota_note": args.quota_note,
        "workload": "One identity-service process, one disposable PostgreSQL cluster, one health request, clean shutdown; no load benchmark.",
        "resource_sharing": "The backend and PostgreSQL share notebook resources. The later Locust generator will also share those resources.",
    }
    try:
        if not args.local and not (Path("/kaggle/working").is_dir() and Path("/kaggle/input").is_dir()):
            raise RuntimeError("Run in a Kaggle CPU notebook, or use --local for diagnostics only")
        report["node"] = command(["node", "--version"])
        report["pnpm"] = command(["pnpm", "--version"], cwd=root)
        report["postgres_tools"] = command([str(args.pg_bin / "pg_ctl"), "--version"])
        if report["node"] != "v24.15.0" or report["pnpm"] != "11.25.0":
            raise RuntimeError("Expected Node 24.15.0 and pnpm 11.25.0")
        report["internet"] = {}
        for endpoint in ["https://nodejs.org/dist/index.json", "https://registry.npmjs.org/pnpm", "https://apt.postgresql.org/pub/repos/apt/"]:
            with urlopen(endpoint, timeout=20) as response:
                report["internet"][endpoint] = response.status
        report["installation_permissions"] = {
            "uid": os.geteuid(),
            "working_directory_writable": os.access(args.output, os.W_OK),
            "postgres_tools_executable": os.access(args.pg_bin / "initdb", os.X_OK),
        }
        exercise_service(root, args.pg_bin, report)
        report["status"] = "passed"
        report["kaggle_feasibility_verified"] = not args.local
    except Exception as error:
        # Subprocess output and environments can contain credentials; record only the error type.
        report["failure_type"] = type(error).__name__
        print("Preflight failed; check the notebook setup and the failed stage in report.json.")
        raise
    finally:
        (args.output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
        shutil.make_archive(str(args.output), "zip", args.output)
        print(f"Artifacts: {args.output}.zip")


if __name__ == "__main__":
    main()
