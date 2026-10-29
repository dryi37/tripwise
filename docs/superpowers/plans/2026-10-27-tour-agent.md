# Tour Agent Implementation Plan

1. Add failing service tests for multi-turn tool execution, schema rejection, and loop limits.
2. Add failing HTTP and environment tests for the new endpoint and optional Gemma configuration.
3. Implement the provider contract, LangGraph workflow, validated tool registry, and HTTP layer.
4. Add the Google GenAI adapter, compose it in the server, and document environment variables.
5. Run targeted tests, full tests, typecheck, build, and a final code review.
