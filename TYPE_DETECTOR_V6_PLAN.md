# type-detector v6 adoption plan

Baseline: `@iobroker/type-detector` 5.0.15 → 6.0.1 (local checkout at `/Users/ingof/Dev/GitHub/ioBroker.type-detector`,
diff `git diff v5.0.15..v6.0.1 -- src/typePatterns.ts`).

## Pass 1 — ioBroker device layer (`src/lib/devices`)

### 1.1 Infrastructure
- [x] `PropertyType`: new members for every new detector state name.
- [x] `GenericDevice`: `RSSI` shared state (`getRssi`/`updateRssi`/`hasRssi`).
- [x] `DIRECTION_ENUM` rename (Blind, BlindButtons, Gate); drop the v5 fallback shim in Lock.

### 1.2 New device classes + `DeviceFactory` entries
- [x] `AirPurifier` (fan + filter)
- [x] `AirQuality` (AQI + 11 pollutant concentrations, each with an optional `_LEVEL`)
- [x] `CoAlarm`
- [x] `Contact`
- [x] `Electricity` (readings only, all optional via `requiredOneOf`)
- [x] `Fan`
- [x] `Flow`
- [x] `Pressure`
- [x] `Pump`

### 1.3 New states on existing classes
- [x] `Thermostat`: `SET_HEATING`, `SET_COOLING`, `VALVE`, `WORKING_MODE`, `WINDOW`, electricity readings
- [x] `AirCondition`: `SET_HEATING`, `SET_COOLING`, `WORKING_MODE`, `SPEED_LEVEL`, `AIRFLOW_DIRECTION`,
      `FILTER_CONDITION`, `FILTER_CONDITION_CARBON`, `FILTER_CHANGE`
- [x] `VacuumCleaner`: `HOME`, `RUN_MODE`, `PROGRESS`, `PHASE`
- [x] `Gate`: `OPENED`, `CLOSED`
- [x] `FireAlarm`: `CO`, `SEVERITY`, `MUTED`, `TEST`
- [x] `Slider`: `ON`, `ON_ACTUAL`
- [x] `ON_TIME` on the lighting devices and `Socket`

### 1.4 Wiring
- [x] `DeviceFactory` map complete for all `Types`

## Pass 2 — Matter mappings
- [x] `to-matter` for the new device types (fan, air purifier, air quality, CO alarm, contact, pump, …)
- [x] `to-iobroker` for the Matter device types that now have a matching ioBroker type
- [x] `SUPPORTED_DEVICES` in `src-admin/src/components/DeviceDialog.tsx` and any other `src-admin` type list —
      deliberately left untouched in pass 1, so a user cannot pick a type that has no Matter mapping yet

## Pass 2 — mapping table (Matter device types are all present in @matter 0.17.9)

| ioBroker type | to-matter target | to-iobroker source |
| --- | --- | --- |
| `fan` | `FanDevice` | `FanDeviceDefinition` |
| `airPurifier` | `AirPurifierDevice` | `AirPurifierDeviceDefinition` |
| `airQuality` | `AirQualitySensorDevice` | `AirQualitySensorDeviceDefinition` |
| `contact` | `ContactSensorDevice` | `ContactSensorDeviceDefinition` (today mapped to `window`) |
| `coAlarm` | `SmokeCoAlarmDevice` (CO feature) | `SmokeCoAlarmDeviceDefinition` |
| `pump` | `PumpDevice` | `PumpDeviceDefinition` |
| `flow` | `FlowSensorDevice` | `FlowSensorDeviceDefinition` |
| `pressure` | `PressureSensorDevice` | `PressureSensorDeviceDefinition` |
| `electricity` | electrical-sensor utility endpoint only | `ElectricalSensorEndpointDefinition` |
| `vacuumCleaner` | `RoboticVacuumCleanerDevice` | `RoboticVacuumCleanerDeviceDefinition` |

Notes:
- `ContactSensorToIoBroker` currently produces a `window`; with `Types.contact` available it should produce
  the contact type, which is a behaviour change for existing installations — decide before touching it.
- The `to-iobroker` converters build their `DetectedDevice` from `ChannelDetector.getPatterns()` with an
  `as DetectedDevice` cast. The cast predates this work but is worth removing while the files are open.

## Setpoint model (v6 dual setpoints)

`SET`, `SET_HEATING` and `SET_COOLING` form the detector group `requiredOneOf: 'setpoint'`, so a
thermostat or air conditioner is detected with any non-empty subset of them.

The three are the same *shape* but not the same *information*: `level.temperature.heating` and
`level.temperature.cooling` say which kind they are in the role itself, while plain `level.temperature`
does not — it needs the mode state to be interpreted. So the device object resolves a *kind* to a state
and the Matter converters stop reasoning about which ioBroker state to touch.

```
kinds                = heating | cooling

supportedKinds()     = heating if SET_HEATING exists or the modes include HEAT
                       cooling if SET_COOLING exists or the modes include COOL
                       (may be empty — one untyped dial, kind unknown)

setpointState(kind)  = the dedicated state for `kind` if it exists
                       else SET, if SET currently represents `kind`
                       else none

setRepresents(kind)  = the kind the current mode selects (HEAT/COOL), when it selects one
                       else every supported kind
                       else every kind, when nothing is known about what the device supports
```

Consequences worth stating:
- Dedicated states are authoritative. With `SET` **and** both dedicated states present, each kind is
  served by its dedicated state and `SET` is left alone, because writing it would be ambiguous.
- A single `SET` on a device whose mode says neither HEAT nor COOL (Auto, Off, or no mode state at all)
  serves both kinds. Two Matter writes then collapse onto one state, last write wins — inherent to a
  one-dial device, and what the adapter already did before v6.
- `supportedKinds()` deliberately has no "default to heating" fallback. That is a Matter-side policy
  (a Matter thermostat must support heating or cooling) and stays in `ThermostatToMatter`.

---

## Session pause — state as of 2026-08-29

**Pass 1 is complete.** Gates: `npm run build`, `npm run lint`, `npx prettier --check "src/**/*.ts"` clean;
`npm test` 243 passing, 0 failing. Everything is **staged, not committed**; plan docs and `docs/` are
deliberately left out of the index.

### Landed beyond the original pass-1 scope

- `ClimateControlDevice<TMode, TWorkingMode>` — new shared base for `Thermostat` and `AirCondition`,
  owning `SET`/`SET_HEATING`/`SET_COOLING`/`MODE`/`WORKING_MODE` and the setpoint resolution documented
  above. Removed 29 duplicated accessors across the two classes.
- Both `ToMatter` converters drive the dual setpoints per kind, so a device detected only via
  `SET_HEATING`/`SET_COOLING` is no longer a dead control.
- `ElectricityDataDevice` `CURRENT` declares `unit: 'A'`, per the decision recorded in PR #830.
  The type detector's `defaultUnit: 'mA'` for `value.current` is the odd one out among the electricity
  readings and is worth raising upstream.
- `GenericElectricityDataDeviceToIoBroker`: dropped the `* 1000` on the Eve (`0x130a0009`) and Neo
  (`0x00125d0022`) vendor current attributes — the part #830 left open. Their sibling power/voltage/
  consumption readings in the same blocks are already passed through unscaled to match W/V/Wh.
- `GenericElectricityDataDeviceToMatter`: frequency updates used `* 100` where the initial seed used
  `* 1000`; the controller direction converts with `/ 1000`, so mHz is right and updates were 10× low.
- `DeviceStateObject.setValue`: boolean written to a numeric object produced `NaN` (`parseFloat(true)`),
  which passed both min/max guards and reached `setForeignStateAsync`. Both the plain-number and the
  percent branch now coerce booleans and reject non-finite values.
- `DeviceStateDescription.unit` is wired through and governs conversion, min/max, object creation and
  the Device Manager label. It was inert before.
- `hasPower()` keeps meaning "settable"; new `hasPowerActual()` on `Slider`, `Dimmer`, `Light`,
  `Socket`, `Ct` covers the readable case.

### Relationship to PR #869 (`feat/controller-api-0.18`, draft)

Verified by test-applying this branch's diff onto `0db409d`: **no source conflicts**. The only
conflicts are `README.md`, `package.json` and `package-lock.json`, and they cannot be pre-resolved —
#869 moves to `@matter` 0.18 and drops `@project-chip/matter.js`, this branch stays on 0.17.9 and
bumps the type detector. Adopting #869's `PairedNode` → `ClientNode` converter signatures would mean
adopting its controller rewrite, since that package is what supplies `PairedNode` today.

### Open decisions for the next session

- Nothing blocking. The Eve/Neo current scaling was removed on the reasoning above; if hardware shows
  those attributes are not in amperes, that is the one change to revisit.

### Known, deliberately not fixed

- `DeviceStateObject.getUnit()` has no callers and now sits beside the new `deviceUnit` getter.
- `GenericDevice.addDeviceState` records `unit` only on a PropertyType's first registration, so a
  read/write pair declaring different units would silently drop the second. Latent today.
- `Fan` has no numeric-`POWER` test; `Pump` has one.
- `test/testAdapter.gui.test.ts` (puppeteer) timed out once in a `before all` hook and passed on
  re-run. Not investigated; believed environmental.
