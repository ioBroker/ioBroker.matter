/** Non-default base port so a real Matter node already bound to 5540 on the host does not collide with the fixture. */
export const BRIDGE_PORT_BASE = 5551;
export const BRIDGE_PASSCODE = 20202021;
export const BRIDGE_DISCRIMINATOR = 3841;

/** Printed by the fixture once every endpoint is mounted and the node is about to announce itself. */
export const READY_MARKER = 'TEST_BRIDGE_READY';
