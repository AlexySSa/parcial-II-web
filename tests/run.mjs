// These tests use separate local data and need no child processes or network.
// Direct node:test imports work on Node 20+ and in restricted environments.
import './catalog.test.mjs';
import './server.test.mjs';
import './team.test.mjs';
