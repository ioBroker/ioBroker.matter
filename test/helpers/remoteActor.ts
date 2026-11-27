import { RemoteActorContext, type ServerNode } from '@matter/main';
import { AccessLevel } from '@matter/main/model';
import { ProtocolMocks } from '@matter/main/protocol';

/**
 * The context of a client on a CASE session with administer access, built from the matter.js protocol mocks. Attribute
 * writes in this context pass access control and run the same validation and `$Changing` reactors as a write that
 * arrives over the network. Pass `command` to invoke a command, which may change read-only attributes.
 *
 * One `act` is one transaction. The network commits each attribute of a write request in its own transaction, so a
 * test that writes several attributes like a controller does needs one `act` per attribute.
 */
export function remoteWriteContext(node: ServerNode, command = false): ReturnType<typeof RemoteActorContext> {
    const fabric = new ProtocolMocks.Fabric();
    fabric.accessControl.accessLevelsFor = () => [
        AccessLevel.View,
        AccessLevel.Operate,
        AccessLevel.Manage,
        AccessLevel.Administer,
    ];
    const session = new ProtocolMocks.NodeSession({ fabric });
    const exchange = new ProtocolMocks.Exchange({ context: { session } });
    return RemoteActorContext({ node, exchange, command });
}
