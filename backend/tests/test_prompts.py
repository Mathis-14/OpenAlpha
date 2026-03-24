from app.agent.prompts import SYSTEM_PROMPT


def test_system_prompt_blocks_unsupported_benchmarks() -> None:
    assert "Compare metrics to industry norms" not in SYSTEM_PROMPT
    assert "S&P 500 avg" not in SYSTEM_PROMPT
    assert (
        "Do not introduce industry, index, or market benchmarks unless a tool "
        "explicitly returned them."
    ) in SYSTEM_PROMPT
