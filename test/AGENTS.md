# Test layer notes

## Two mock adapters, two directions

- `helpers/mockObjectAdapter.ts` serves a **fixed ioBroker object tree** and is used for the ioBroker → Matter
  direction. Alias states resolve to their target the way js-controller does, so a value written through an
  alias lands on the target and a target change is reported to every alias pointing at it.
- `helpers/mockControllerAdapter.ts` **records** the objects and states a converter creates and is used for the
  Matter → ioBroker direction.

## Object fixtures

`fixtures/ioBrokerObjects.json` and `fixtures/ioBrokerBridges.json` come from real admin exports:

```bash
npm run test:fixtures -- ~/Downloads/alias.json ~/Downloads/0_userdata.json ~/Downloads/matter.0.bridges.json
```

The generator keeps only the `common` fields the detector and the device layer read. Exports carry expanded
`common.enums` trees with base64 icons; production passes `ignoreEnums`, so they are dropped.

One bridge entry (`zigbee.0.EEEEEEE.color`) has no object in the export on purpose - it covers the path where a
configured object no longer exists.

## Where the detection paths are covered

`deviceDetectionPaths.test.ts` owns the failure and fallback paths of `src/lib/deviceDetection.ts` with
object trees built for them; the exported fixtures only ever describe correctly configured devices, so they
reach the happy path only. It also holds a characterization test pinning that the unrestricted detection
retry never reports a device, because `ChannelDetector.detect` caches its pattern list and its checked-pattern
set on the options object that `getIoBrokerDeviceStates` hands to both calls.

## The endpoint snapshot

`fixtures/toMatterFromObjects.snapshot.json` pins the Matter endpoints every exported bridge entry produces.
It pins the converter output only: the test mounts the endpoints directly, where `BridgedDevicesNode` also
requires `BridgedDeviceBasicInformationServer` onto each of them, registers the maintenance clusters and wraps
a multi-endpoint device in a composed `BridgedNodeEndpoint`. None of that is covered here.
Regenerate with `SNAPSHOT_UPDATE=1 npm test` and review the diff - it is the review. `doorLock.credentialKey` is
random per instance and is excluded; add any further per-instance attribute to `IGNORED_ATTRIBUTES`.

## MdnsService is shared

The unit suites that mount endpoints build their environment through `helpers/matterTestEnvironment.ts`.
`MdnsService` registers itself on `environment.root`, which is `Environment.default` for every environment
parented to it, and `close()` does not deregister - so a suite closing it hands every later suite a closed
service. `rootHooks.ts` closes it once, from both mocha configs. The integration suite builds and disposes
its own environment in `helpers/testMatterController.ts` and does not use the helper.

## What the object mock does not model

`MockObjectAdapter.getForeignStateAsync` synthesizes a value from `common.def` for a state nobody wrote,
where js-controller returns `null`. Any converter branch that distinguishes "no value yet" from `0`, `false`
or `''` is therefore exercised on the wrong side here - test that branch against an explicit `seedValue`.
Writes are stored but not echoed back through `SubscribeManager` the way an acked js-controller write is,
so a write-then-read-back round trip is not covered either. The alias's own `min`/`max` are ignored; the
target's are what seeding uses.

## Device type validation

`rootHooks.ts` runs every test node with matter.js `endpoint.validation` = `strict`, so a converter that builds a
non-conforming endpoint fails its test at construction. Strict stops at the first refused endpoint of a test; to see
every violation of a run, use `MATTER_ENDPOINT_VALIDATION=warn` and raise the log level of the suites, which set
`LogLevel.FATAL`. A `.with(OurServer)` replaces the device type's specialized server, so a mandatory element the
device type adds through `alter()` (TriggerEffect, OperationCompletion) has to be re-added on our class.

The bridge fixture runs in `warn` and fails its start through `assertConformance()` on any violation except the
listed `INTENDED_VIOLATIONS`; cluster implementation warnings (unimplemented mandatory commands) are not fatal there.
