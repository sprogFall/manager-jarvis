import sys

from app.services.stack_service import StackService


class TestStackServiceStream:
    def test_run_command_stream_writes_output(self):
        service = StackService()
        captured: list[str] = []

        result = service._run_command_stream(  # noqa: SLF001
            [
                sys.executable,
                "-c",
                "import sys; print('hello'); sys.stderr.write('world\\n')",
            ],
            log_writer=captured.append,
            timeout=10,
        )

        joined = "\n".join(captured)
        assert "hello" in joined
        assert "world" in joined
        assert result["exit_code"] == 0
