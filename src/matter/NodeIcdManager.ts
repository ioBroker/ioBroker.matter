import { IcdClient, IcdMultiAdminError, Observable, ObserverGroup } from '@matter/main';
import { IcdManagementClient, OperationalCredentialsClient } from '@matter/main/behaviors';
import type { IcdManagement } from '@matter/main/clusters';
import type { PairedNode } from '@project-chip/matter.js/device';
import { deriveIcdMode, otherFabricClientCount, type IcdMode } from './icdUtils';

/** Registration was refused because other-vendor administrators may not support LIT. */
export class IcdMultiAdminConflictError extends Error {
    readonly vendorIds: number[];

    constructor(vendorIds: number[]) {
        super('Battery Saver Mode was refused because other administrators may not support it');
        this.name = 'IcdMultiAdminConflictError';
        this.vendorIds = vendorIds;
    }
}

export interface IcdInfo {
    features: {
        checkInProtocolSupport: boolean;
        userActiveModeTrigger: boolean;
        longIdleTimeSupport: boolean;
        dynamicSitLitSupport: boolean;
    };
    operatingMode: IcdManagement.OperatingMode | undefined;
    /** Seconds the device may stay asleep between check-ins. */
    idleModeDuration: number | undefined;
    userActiveModeTriggerHint: IcdManagement.UserActiveModeTrigger | undefined;
    userActiveModeTriggerInstruction: string | undefined;
}

/**
 * ICD (Intermittently Connected Device) management for one paired node: reads the peer's ICD state and
 * drives the controller-side check-in registration that Matter calls LIT and we call Battery Saver Mode.
 */
export class NodeIcdManager {
    readonly changed = Observable<[]>();

    readonly #node: PairedNode;
    readonly #observers = new ObserverGroup();
    #pending = false;

    constructor(node: PairedNode) {
        this.#node = node;

        const root = node.node;
        // Both behaviors are absent for a non-ICD peer, and IcdClient is only injected once the peer's
        // IcdManagement cluster is discovered — eventsOf() throws on a behavior that isn't installed yet.
        if (root.behaviors.has(IcdClient)) {
            const icdEvents = root.eventsOf(IcdClient);
            this.#observers.on(icdEvents.registered, () => this.changed.emit());
            this.#observers.on(icdEvents.unregistered, () => this.changed.emit());
            this.#observers.on(icdEvents.available$Changed, () => this.changed.emit());
            this.#observers.on(icdEvents.checkInMissed, () => this.changed.emit());
        }

        if (root.behaviors.has(IcdManagementClient)) {
            const managementEvents = root.eventsOf(IcdManagementClient);
            this.#observers.on(managementEvents.operatingMode$Changed, () => this.changed.emit());
            this.#observers.on(managementEvents.idleModeDuration$Changed, () => this.changed.emit());
        }
    }

    get supported(): boolean {
        return this.#node.node.maybeStateOf(IcdManagementClient) !== undefined;
    }

    /** True only with the LongIdleTimeSupport feature AND a reported Matter specification version >= 1.4.0. */
    get litCapable(): boolean {
        return IcdClient.litSupported(this.#node.node);
    }

    get registered(): boolean {
        return this.#node.node.maybeStateOf(IcdClient)?.registered === true;
    }

    /**
     * Whether the peer is within its expected check-in window. A sleeping LIT device is available, so this
     * is the reachability signal for ICD, not `PairedNode.isConnected`.
     */
    get available(): boolean {
        return this.#node.node.maybeStateOf(IcdClient)?.available ?? true;
    }

    get info(): IcdInfo | undefined {
        const state = this.#node.node.maybeStateOf(IcdManagementClient);
        if (state === undefined) {
            return undefined;
        }
        const features = this.#node.node.maybeFeaturesOf(IcdManagementClient);
        return {
            features: {
                checkInProtocolSupport: features?.checkInProtocolSupport === true,
                userActiveModeTrigger: features?.userActiveModeTrigger === true,
                longIdleTimeSupport: features?.longIdleTimeSupport === true,
                dynamicSitLitSupport: features?.dynamicSitLitSupport === true,
            },
            operatingMode: state.operatingMode,
            idleModeDuration: state.idleModeDuration,
            userActiveModeTriggerHint: state.userActiveModeTriggerHint,
            userActiveModeTriggerInstruction: state.userActiveModeTriggerInstruction,
        };
    }

    /** The operating-mode-derived part of {@link mode}, ignoring a running ICD operation. */
    #derivedMode(): IcdMode {
        return deriveIcdMode({
            litCapable: this.litCapable,
            operatingMode: this.#node.node.maybeStateOf(IcdManagementClient)?.operatingMode,
            available: this.available,
        });
    }

    get mode(): IcdMode {
        if (this.#pending) {
            return 'pending';
        }
        return this.#derivedMode();
    }

    /**
     * Whether the peer is LIT-capable and its IcdManagement OperatingMode currently reports `Lit`: an
     * interaction with it can sit queued for the length of its idle interval. Unlike {@link mode}, this
     * is unaffected by a user-triggered ICD operation in flight — that is a UI concern, not a statement
     * about how the peer actually operates.
     */
    get longIdleTimeActive(): boolean {
        const mode = this.#derivedMode();
        return mode === 'lit' || mode === 'litOffline';
    }

    get pending(): boolean {
        return this.#pending;
    }

    set pending(value: boolean) {
        if (this.#pending === value) {
            return;
        }
        this.#pending = value;
        this.changed.emit();
    }

    /** @throws {IcdMultiAdminConflictError} when other-vendor administrators block registration */
    async register(allowMultiAdmin: boolean): Promise<void> {
        try {
            await this.#node.node.act(agent => agent.get(IcdClient).register({ allowMultiAdmin }));
        } catch (error) {
            IcdMultiAdminError.accept(error);
            throw new IcdMultiAdminConflictError(await this.#foreignAdminVendorIds(error.adminVendorIds));
        }
    }

    /**
     * `adminVendorIds` includes our own fabric (matter.js's `DEFAULT_ADMIN_VENDOR_ID` fallback), which must
     * not be shown to the user as a possibly-incompatible ecosystem. Best-effort: a failed lookup leaves the
     * list unfiltered rather than losing the conflict report.
     */
    async #foreignAdminVendorIds(vendorIds: readonly number[]): Promise<number[]> {
        try {
            const { fabrics, currentFabricIndex } = await this.#node.node.getStateOf(
                OperationalCredentialsClient,
                ['fabrics', 'currentFabricIndex'],
                { fabricFilter: false },
            );
            const ownVendorId = fabrics?.find(fabric => fabric.fabricIndex === currentFabricIndex)?.vendorId;
            return ownVendorId === undefined ? [...vendorIds] : vendorIds.filter(vendorId => vendorId !== ownVendorId);
        } catch {
            return [...vendorIds];
        }
    }

    /** `force` clears only local state, for a peer that cannot be reached any more. */
    async unregister(force: boolean): Promise<void> {
        await this.#node.node.act(agent => (force ? agent.get(IcdClient).forget() : agent.get(IcdClient).unregister()));
    }

    /**
     * Drops the local registration and reconnects; a LIT peer re-registers itself once subscribed.
     * `triggerReconnect` preserves the node's stored connect options and is fire-and-forget by design: its
     * awaitable form only awaits the internal resubscribe toggle, not the reconnect outcome, so awaiting it
     * would tell the caller nothing more than this does.
     */
    async resync(): Promise<void> {
        await this.#node.node.act(agent => agent.get(IcdClient).forget());
        this.#node.triggerReconnect();
    }

    /**
     * Registrations held by other fabrics. The unfiltered `registeredClients` read parks until a sleeping LIT
     * peer checks in. `currentFabricIndex` is read fresh alongside it, not from cached state, since it has no
     * `nonvolatile` quality and so reads back `undefined` on a rehydrated or not-yet-reconnected node.
     */
    async otherFabricClientCount(): Promise<number> {
        const [registrations, credentials] = await Promise.all([
            this.#node.node.getStateOf(IcdManagementClient, ['registeredClients'], { fabricFilter: false }),
            this.#node.node.getStateOf(OperationalCredentialsClient, ['currentFabricIndex'], { fabricFilter: false }),
        ]);
        return otherFabricClientCount(
            registrations.registeredClients ?? new Array<IcdManagement.MonitoringRegistration>(),
            credentials.currentFabricIndex,
        );
    }

    close(): void {
        this.#observers.close();
        this.changed[Symbol.dispose]();
    }
}
