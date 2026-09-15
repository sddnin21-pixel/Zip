/**
 * Central skills entrypoint. Every skill module registers itself into
 * skillRegistry as a side effect of being imported. Importing this file
 * once at app startup (see app/_layout.tsx) is what makes every skill
 * from brief section 21 available to the agent loop and UI.
 *
 * Brief section 75 — one authoritative registration point, no duplicate
 * skill systems.
 */
import "./web-search/web-search-skill";
import "./files/file-skills";
import "./image/image-generation-skill";
import "./image/image-analyze-skill";
import "./video/video-generation-skill";
import "./slides/slide-generation-skill";
import "./documents/document-generation-skill";
import "./memory/memory-skills";
import "./code/calculator-skill";
import "./code/code-execution-skill";

export { skillRegistry } from "../core/tools/skill-registry";
