import { describe, expect, it } from "vitest";
import { MCP_SURFACE_TOOLS, TOOL_NAMES } from "../../src/constants.js";
import { MCP_TOOL_DEFINITIONS } from "../../src/tools.js";

describe("MCP tool registry", () => {
    it("registers exactly the five surface tools", () => {
        expect(MCP_TOOL_DEFINITIONS).toHaveLength(MCP_SURFACE_TOOLS.length);
        expect(MCP_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([...MCP_SURFACE_TOOLS]);
    });

    it("uses stable tool name constants", () => {
        for (const name of MCP_SURFACE_TOOLS) {
            expect(Object.values(TOOL_NAMES)).toContain(name);
        }
    });

    it("requires string args for parameterized tools", () => {
        const getEntity = MCP_TOOL_DEFINITIONS.find((tool) => tool.name === TOOL_NAMES.getEntity);
        expect(getEntity).toBeDefined();
        const result = getEntity?.handler({ model: { entities: [], relations: [], rules: [] } }, { id: 42 });
        expect(result).toEqual({ error: expect.stringContaining("not found") });
    });
});
