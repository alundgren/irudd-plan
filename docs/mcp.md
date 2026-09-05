# MCP contract

Endpoint: `POST /mcp`

Protocol: `2026-07-28`

Plan contract: `v1`

Send a valid Cloudflare Access assertion in `Cf-Access-Jwt-Assertion` or as a bearer token. After initialization, send `MCP-Protocol-Version: 2026-07-28` with every request.

## Tools

| Tool                  | Result                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `write_plan`          | Creates or replaces a complete plan revision atomically.                                          |
| `get_work_item`       | Returns one item, required shared records and assets, a compact epic index, and a packet version. |
| `get_related_context` | Retrieves one deliberately selected shared context and its required records.                      |
| `check_packet`        | Returns `unchanged`, `changed`, `deleted`, or `unavailable`.                                      |
| `list_plans`          | Lists plans for the authenticated owner only.                                                     |

`write_plan` takes `operationId`, `expectedVersion`, and the complete `plan`. Use `expectedVersion: null` only when creating a plan. A retry with the same operation ID and identical request returns the first result. Reusing the ID with different input returns `OPERATION_MISMATCH`.

## Resources

```text
irudd-plan://plans/{planId}/items/{itemId}
irudd-plan://plans/{planId}/contexts/{contextId}
```

Both templates are listed through `resources/templates/list` and resolved through `resources/read`. They identify current content and never contain a revision segment.

## Selected packet rules

The selected packet contains the full requested item, every recursively required shared context, required decisions, and required asset descriptors. It also contains the epic goal and an index with each item's ID, title, short goal, and related item IDs. It does not include sibling requirements, checks, deferrals, or completion expectations.

`packetVersion` is a SHA-256 digest over the selected item and its required context, decisions, and assets. Editing an unrelated sibling does not change it. Editing a referenced decision does.

## Errors

| Code                    | Meaning                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `AUTH_INVALID`          | The assertion is absent, forged, has the wrong issuer or audience, or otherwise fails verification.          |
| `AUTH_EXPIRED`          | The assertion expired.                                                                                       |
| `AUTH_UNKNOWN_IDENTITY` | The verified identity has no configured owner mapping.                                                       |
| `CONTRACT_UNSUPPORTED`  | The request names a contract other than `v1`.                                                                |
| `REQUEST_INVALID`       | The request does not match the Effect Schema contract or has an empty operation ID.                          |
| `DUPLICATE_ID`          | A stable ID occurs more than once in a plan.                                                                 |
| `REFERENCE_MISSING`     | A required context, decision, asset, related item, or other required field is absent.                        |
| `REFERENCE_CYCLE`       | Required shared contexts contain a cycle.                                                                    |
| `ASSET_UNAVAILABLE`     | A required asset descriptor says the asset is unavailable.                                                   |
| `PLAN_CONFLICT`         | `expectedVersion` does not match current state or the repository identity changed.                           |
| `OPERATION_MISMATCH`    | An operation ID was reused with different input.                                                             |
| `PLAN_NOT_FOUND`        | The authenticated owner cannot retrieve the plan. The response does not reveal whether another owner has it. |
| `ITEM_NOT_FOUND`        | The requested item is absent.                                                                                |
| `CONTEXT_NOT_FOUND`     | The deliberately requested shared context is absent.                                                         |

MCP version failures use JSON-RPC error data code `MCP_PROTOCOL_UNSUPPORTED` and list the supported version.

## Minimal call sequence

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2026-07-28",
    "capabilities": {},
    "clientInfo": { "name": "example", "version": "1" }
  }
}
```

Then call a tool with the protocol header:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_work_item",
    "arguments": { "contractVersion": "v1", "planId": "example-plan", "itemId": "item-service" }
  }
}
```

The complete write document is in `examples/plan.json`, and `scripts/mcp-example.ts` runs the create and read sequence.
