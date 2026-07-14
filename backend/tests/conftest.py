import pytest_asyncio  # noqa: F401


def pytest_collection_modifyitems(config, items):
    """Auto-mark async tests with asyncio."""
    import pytest
    for item in items:
        if item.get_closest_marker("asyncio") is None:
            # if the underlying function is a coroutine
            import inspect
            if inspect.iscoroutinefunction(item.function):
                item.add_marker(pytest.mark.asyncio)
