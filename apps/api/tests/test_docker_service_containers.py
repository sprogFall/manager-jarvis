from types import SimpleNamespace

from app.services.docker_service import DockerService


class FakeContainer:
    def __init__(
        self,
        *,
        container_id: str,
        name: str,
        image: str,
        status: str,
        state: str,
        ports: dict,
    ) -> None:
        self.id = container_id
        self.name = name
        self.status = status
        self.reload_calls = 0
        self.attrs = {
            "Config": {"Image": image},
            "State": {"Status": state},
            "Status": f"{state} state",
            "NetworkSettings": {"Ports": ports},
        }

    def reload(self) -> None:
        self.reload_calls += 1


def make_service(containers: list[FakeContainer]) -> DockerService:
    service = DockerService()
    service.client = SimpleNamespace(containers=SimpleNamespace(list=lambda all=True: containers))
    return service


class TestDockerServiceListContainers:
    def test_skip_reload_and_stats_in_fast_mode(self) -> None:
        container = FakeContainer(
            container_id="c1",
            name="web",
            image="nginx:latest",
            status="running",
            state="running",
            ports={"80/tcp": [{"HostIp": "0.0.0.0", "HostPort": "8080"}]},
        )
        service = make_service([container])
        service._container_stats = lambda c: (_ for _ in ()).throw(AssertionError("should not load stats"))  # type: ignore[method-assign]

        result = service.list_containers(include_stats=False)

        assert container.reload_calls == 0
        assert result[0]["stats"] is None
        assert result[0]["ports"] == ["0.0.0.0:8080->80/tcp"]

    def test_reload_and_stats_only_for_running_container_when_enabled(self) -> None:
        running = FakeContainer(
            container_id="c1",
            name="web",
            image="nginx:latest",
            status="running",
            state="running",
            ports={},
        )
        exited = FakeContainer(
            container_id="c2",
            name="worker",
            image="python:3.11",
            status="exited",
            state="exited",
            ports={},
        )
        service = make_service([running, exited])
        calls = {"stats": 0}

        def fake_stats(_container):
            calls["stats"] += 1
            return {"cpu_percent": 1.0, "memory_usage": 1, "memory_limit": 10, "memory_percent": 10.0}

        service._container_stats = fake_stats  # type: ignore[method-assign]

        result = service.list_containers(include_stats=True)

        assert running.reload_calls == 1
        assert exited.reload_calls == 0
        assert calls["stats"] == 1
        assert result[0]["stats"]["cpu_percent"] == 1.0
        assert result[1]["stats"] is None
