# JSON integrity fixtures

The protocol validator enumerates every tracked `benchmark/protocol/**/*.json` file and parses it with duplicate-member rejection. A last-write-wins parser such as bare `JSON.parse` is insufficient. The launch gate fails on any duplicate object member at any nesting depth.

The same validator parses `duplicate-key.txt` as a negative fixture and must reject it because the root object repeats `sha256`. The `.txt` suffix keeps the intentionally invalid document outside the tracked JSON population.
