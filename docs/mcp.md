# MCP contract

Endpoint: `POST /mcp`

Protocol: `2026-07-28`

Plan contract: `v1`

Send a valid Cloudflare Access assertion in `Cf-Access-Jwt-Assertion` or as a bearer token. This is a stateless modern MCP endpoint: it does not use `initialize`, `notifications/initialized`, or sessions. Every request must carry the protocol version, client identity, and client capabilities in `params._meta`. Its `MCP-Protocol-Version`, `Mcp-Method`, and applicable `Mcp-Name` headers must match the body. The official v2 client performs this automatically when pinned to `2026-07-28`.

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
irudd-plan://plans/{planId}
irudd-plan://plans/{planId}/items/{itemId}
irudd-plan://plans/{planId}/contexts/{contextId}
```

All templates are listed through `resources/templates/list` and resolved through `resources/read`. The plan URI returns only the epic goal, repository identity, and compact item index. The URIs identify current content and never contain a revision segment.

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

MCP version failures use JSON-RPC error code `-32022` and list the requested and supported versions in error data.

## Minimal call sequence

First send `server/discover` with `MCP-Protocol-Version: 2026-07-28` and `Mcp-Method: server/discover`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "server/discover",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { "name": "example", "version": "1" },
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

Then call a tool with the same protocol header plus `Mcp-Method: tools/call` and `Mcp-Name: get_work_item`:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_work_item",
    "arguments": { "contractVersion": "v1", "planId": "example-plan", "itemId": "item-service" },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { "name": "example", "version": "1" },
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

The complete write document is in `examples/plan.json`, and `scripts/mcp-example.ts` runs the create and read sequence.
