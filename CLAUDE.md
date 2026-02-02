# ioBroker.matter - Project Guide

## Project Overview

This is an ioBroker adapter for Matter protocol support. It enables:
1. **Controller Mode**: Connect and control Matter-based devices from ioBroker
2. **Bridge Mode**: Expose ioBroker devices as Matter bridges to external controllers (Google Home, Apple Home, Alexa)
3. **Device Mode**: Expose individual ioBroker devices as standalone Matter devices

Built on `@matter/main` (matter.js) library and follows the ioBroker adapter development patterns.

## Technology Stack

- **Backend**: TypeScript, Node.js 20+
- **Frontend**: React 18, Vite, Material-UI
- **Matter Library**: `@matter/main`, `@matter/nodejs`, `@project-chip/matter.js`
- **ioBroker Integration**: `@iobroker/adapter-core`, `@iobroker/type-detector`, `@iobroker/dm-utils`

## Project Structure

```
ioBroker.matter/
├── src/                      # Backend TypeScript source
│   ├── main.ts              # Main adapter entry point (MatterAdapter class)
│   ├── ioBrokerStorageTypes.ts  # Type definitions for ioBroker storage
│   ├── lib/                 # Core library code
│   │   ├── devices/         # ioBroker device type implementations
│   │   ├── DeviceFactory.ts # Factory for creating device instances
│   │   ├── DeviceManagement.ts # Device management for DM (Device Manager)
│   │   └── SubscribeManager.ts # State subscription handling
│   └── matter/              # Matter protocol implementations
│       ├── BaseServerNode.ts       # Base class for Matter server nodes
│       ├── BridgedDevicesNode.ts   # Matter bridge implementation
│       ├── ControllerNode.ts       # Matter controller implementation
│       ├── DeviceNode.ts           # Single Matter device implementation
│       ├── GeneralMatterNode.ts    # Shared Matter node functionality
│       ├── IoBrokerObjectStorage.ts # Matter storage using ioBroker objects
│       ├── behaviors/              # Custom Matter behaviors
│       ├── to-iobroker/           # Matter → ioBroker device converters
│       └── to-matter/             # ioBroker → Matter device converters
├── src-admin/               # Frontend React application
│   ├── src/
│   │   ├── App.tsx         # Main React application
│   │   ├── types.d.ts      # Shared TypeScript types
│   │   ├── Tabs/           # Tab components (Controller, Bridges, Devices, Options)
│   │   └── components/     # Reusable UI components
│   └── package.json
├── admin/                   # Built admin UI assets
├── build/                   # Compiled backend JavaScript
├── io-package.json          # ioBroker adapter metadata
└── package.json             # Node.js dependencies
```

## Build Commands

```bash
# Install all dependencies (both backend and frontend)
npm run npm

# Build everything
npm run build

# Build backend only
npm run build:ts

# Build frontend only
npm run build:gui

# Run tests
npm test

# Lint backend
npm run lint

# Lint frontend
npm run lint-frontend

# Format code
npm run format

# Start dev server for frontend
cd src-admin && npm start

# Update all dependencies
npm run update-packages
```

## Backend Architecture

### Main Adapter (src/main.ts)

The `MatterAdapter` class extends ioBroker's `Adapter` base class:

- **Initialization**: `#onReady()` - Sets up Matter environment, syncs devices, starts nodes
- **Device Management**: `#devices` (Map), `#bridges` (Map), `#controller` - Track active Matter nodes
- **Message Handling**: `#onMessage()` - Handles commands from UI via ioBroker messaging
- **State Changes**: `#onStateChange()` - Delegates to `SubscribeManager`
- **Object Changes**: `#onObjectChange()` - Syncs device/bridge configurations

### Device Type Detection

Uses `@iobroker/type-detector` to identify device types from ioBroker state structures:
- Supported types defined in `src/lib/devices/` (Light, Dimmer, Thermostat, Lock, etc.)
- Each type maps to specific Matter device clusters

### Matter Node Types

1. **BridgedDevicesNode** (`src/matter/BridgedDevicesNode.ts`)
   - Exposes multiple ioBroker devices as a single Matter bridge
   - Port 5540 for default (Alexa-compatible) bridge

2. **DeviceNode** (`src/matter/DeviceNode.ts`)
   - Exposes single ioBroker device as Matter device

3. **ControllerNode** (`src/matter/ControllerNode.ts`)
   - Pairs with external Matter devices
   - Creates ioBroker states from Matter device attributes

### Device Mapping

**ioBroker → Matter** (`src/matter/to-matter/`):
- `GenericDeviceToMatter` - Base class
- Device-specific implementations (e.g., `LightToMatter.ts`, `ThermostatToMatter.ts`)

**Matter → ioBroker** (`src/matter/to-iobroker/`):
- `GenericDeviceToIoBroker` - Base class
- Endpoint-specific implementations

## Frontend Architecture

### Main Application (src-admin/src/App.tsx)

React SPA built with:
- Material-UI components
- `@iobroker/adapter-react-v5` for ioBroker integration
- Vite for bundling

### Tabs

- **Options** (`Tabs/Options.tsx`): General adapter settings
- **Controller** (`Tabs/Controller.tsx`): Manage paired Matter devices
- **Bridges** (`Tabs/Bridges.tsx`): Configure Matter bridges
- **Devices** (`Tabs/Devices.tsx`): Configure standalone Matter devices

### Configuration Handler (components/ConfigHandler.tsx)

Manages synchronization between UI state and ioBroker objects:
- Loads configuration from `matter.X.bridges.*`, `matter.X.devices.*`, `matter.X.controller`
- Subscribes to object changes for real-time updates
- Saves configuration back to ioBroker objects

## Backend ↔ Frontend Communication

### Two-Way Communication Pattern

1. **UI → Backend (Commands)**
   ```typescript
   // Frontend sends command via socket
   socket.sendTo(`matter.${instance}`, 'commandName', payload);

   // Backend handles in #onMessage()
   async #onMessage(obj: ioBroker.Message): Promise<void> {
     switch (obj.command) {
       case 'nodeStates': // ...
       case 'getLicense': // ...
       case 'controller*': // Delegated to handleControllerCommand()
       case 'device*':     // Delegated to handleDeviceCommand()
     }
   }
   ```

2. **Backend → UI (Subscriptions)**
   ```typescript
   // Frontend subscribes to instance
   socket.subscribeOnInstance(`matter.${instance}`, 'gui', null, this.onBackendUpdates);

   // Backend pushes updates via sendToGui()
   await this.sendToGui({
     command: 'bridgeStates',
     states: { [uuid]: nodeState }
   });
   ```

### GUI Message Commands

Defined in `src-admin/src/types.d.ts`:
- `bridgeStates`: Initial state of all bridges/devices
- `updateStates`: Partial state update
- `progress`: Show progress dialog
- `processing`: Show processing indicator
- `stopped`: Backend stopped notification
- `updateController`: Refresh controller view
- `identifyPopup`: Device identification notification
- `discoveredDevice`: New device found during commissioning

### Object-Based Configuration

Configuration is stored in ioBroker objects:

```
matter.X.bridges.<uuid>     # Channel object with bridge config in native
matter.X.devices.<uuid>     # Channel object with device config in native
matter.X.controller         # Folder object with controller config in native
matter.X.controller.<nodeId> # Folder for each paired Matter node
```

Frontend modifies objects → Backend receives via `onObjectChange` → Syncs Matter nodes

## Key Concepts

### Commissioning Flow

1. Device/Bridge created with QR code and manual pairing code
2. User scans QR code in external controller (Google Home, etc.)
3. Controller commissions the Matter device
4. `connectionInfo` updated with controller details

### Controller Pairing Flow

1. Enable controller in settings
2. Start discovery or enter QR code
3. Controller pairs with external Matter device
4. Device endpoints mapped to ioBroker states

### License Checking

Pro subscription required for:
- More than 1 bridge
- More than 2 standalone devices
- More than 5 devices per bridge

Verified via `iobroker.pro` API in `checkLicense()`.

## Critical: Separate TypeScript Projects

**IMPORTANT: The backend (`src/`) and frontend (`src-admin/`) are TWO SEPARATE TypeScript projects with independent compilation.**

### Rules

1. **Never import from `src-admin/` in backend code** - The backend tsconfig does not include src-admin
2. **Never import from `src/` in frontend code** - The frontend tsconfig does not include src
3. **Shared types must be duplicated** - If both projects need the same types, define them in both:
   - Backend types: `src/ioBrokerStorageTypes.ts`
   - Frontend types: `src-admin/src/types.d.ts`
4. **Keep type definitions in sync manually** - When modifying shared types, update both files

### Why This Matters

Cross-project imports will:
- Silently fail during TypeScript compilation (files outside the project are ignored)
- Result in missing code in the built output
- Cause runtime errors like "Unknown command" when handlers aren't compiled

### Type Locations

| Type Category | Backend Location | Frontend Location |
|---------------|------------------|-------------------|
| Config types | `src/ioBrokerStorageTypes.ts` | `src-admin/src/types.d.ts` |
| Network graph types | `src/ioBrokerStorageTypes.ts` | `src-admin/src/types.d.ts` |
| GUI message types | N/A (backend uses inline) | `src-admin/src/types.d.ts` |

## Development Tips

### Required Checks Before Committing

**IMPORTANT: Always run these checks after making changes:**

```bash
# After backend changes
npm run lint

# After frontend changes (src-admin/)
npm run lint-frontend

# Build to verify compilation
npm run build
```

The frontend linter (`npm run lint-frontend`) uses ESLint with Prettier and must pass before committing any frontend code changes.

### Adding New Device Type

1. Create ioBroker device class in `src/lib/devices/NewDevice.ts`
2. Add to exports in `src/lib/index.ts`
3. Add factory case in `src/lib/DeviceFactory.ts`
4. Create Matter mapping in `src/matter/to-matter/NewDeviceToMatter.ts`
5. Add factory case in `src/matter/to-matter/matterFactory.ts`

### Testing

```bash
npm test  # Runs mocha tests in test/ directory
```

### Debug Logging

Set `debug: true` in adapter config to enable verbose matter.js logging.

## Important Files Reference

| File | Purpose |
|------|---------|
| `src/main.ts` | Main adapter class, entry point |
| `src/lib/DeviceFactory.ts` | Creates ioBroker device instances |
| `src/matter/to-matter/matterFactory.ts` | Creates Matter device mappings |
| `src/matter/to-iobroker/ioBrokerFactory.ts` | Creates ioBroker mappings for controller |
| `src-admin/src/App.tsx` | Main React application |
| `src-admin/src/components/ConfigHandler.tsx` | Config sync between UI and objects |
| `src/ioBrokerStorageTypes.ts` | Backend TypeScript types |
| `src-admin/src/types.d.ts` | Frontend TypeScript types |
| `io-package.json` | ioBroker adapter metadata |