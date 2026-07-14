# Token Discipline

- If a tool call fails, do not blindly retry. Diagnose why first.
- Every ~10 tool calls, check: am I closer to the goal than 10 calls ago? If not, stop and say so.
- Don't spawn subagents or heavy searches for something a direct read can answer.
- Don't hold large outputs in context. Extract what matters and move on.
- If you've explored a lot without producing anything, pick a direction and write.
