# Installing beliq-mcp: steps for an AI agent

These steps are for an AI agent (Cline, or any other MCP client) that sets the server up for a user. The README has the same setup for people.

## 1. Check Node.js

The server needs Node.js 22 or later. Run `node --version`. If it is older or missing, ask the user to install a current Node.js first.

## 2. Add the server to your own MCP settings file

The server runs from npm through `npx`. Do not clone, install or build this repo, even when a clone is in the user's workspace.

Add this entry under `mcpServers` in the MCP settings file of the client you are running in, with the placeholder exactly as written. For Cline that is `cline_mcp_settings.json`, the file Cline's own instructions name. Config files of other tools in the user's workspace, such as `.claude/settings.json` or `.cursor/mcp.json`, are not yours to change.

```json
"beliq": {
  "command": "npx",
  "args": ["-y", "beliq-mcp"],
  "env": {
    "BELIQ_API_KEY": "PASTE_YOUR_BELIQ_API_KEY_HERE"
  }
}
```

Leave out `BELIQ_AUTH` and `BELIQ_BASE_URL`. Their defaults are right unless the user asks for something else.

## 3. Let the user put in the API key

Do not ask the user for the key in the chat. Text in the chat goes to the model provider, so a key typed there has left the user's machine.

Instead, tell the user to:

1. create a key in the beliq dashboard, on the API Keys page. A `blq_test_` sandbox key is enough to try the server: it never bills, and the documents it makes are marked as test documents.
2. open the MCP settings file themselves and replace `PASTE_YOUR_BELIQ_API_KEY_HERE` with the key.
3. say when it is done.

Never put the key into a shell command, a script, a test request or a log, and do not read the settings file back once the key is in it.

## 4. Test with the `beliq_check_account` tool

When the user says the key is in place, call the `beliq_check_account` tool. Do not test with `curl` or another request of your own: the tool sends the key from the settings file, so the key never appears in the conversation. The call draws no quota.

- It works when it reports the plan, the remaining quota, and whether the key is live or a `blq_test_` sandbox key.
- `beliq API key rejected (401)` means the placeholder or a wrong key is still in the file. Ask the user to check the file. Do not ask them to paste the key.
- If the client lists no beliq tools, ask the user to restart the MCP server or the client.
